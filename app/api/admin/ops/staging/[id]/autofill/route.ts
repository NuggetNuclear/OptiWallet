import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-guard";
import { generateJSON, aiAvailable } from "@/lib/ai/provider";
import { NextRequest, NextResponse } from "next/server";

const NO_CACHE = { "Cache-Control": "no-store" };

const DAYS_ES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/**
 * POST /api/admin/ops/staging/[id]/autofill
 *
 * Usa IA generativa para sugerir los valores correctos de todos los campos
 * editables de una promo en staging, basándose en el texto de condiciones,
 * tarjetas origen y datos ya parseados.
 *
 * Devuelve el mismo shape que `overrides` en el endpoint de approve.
 * Best-effort: si la IA no está disponible devuelve 503.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin(req))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401, headers: NO_CACHE });
  }
  if (!aiAvailable()) {
    return NextResponse.json({ error: "IA no configurada" }, { status: 503, headers: NO_CACHE });
  }

  const { id } = await params;
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ error: "id inválido" }, { status: 400, headers: NO_CACHE });
  }

  const rows = await sql`SELECT * FROM promo_staging WHERE id = ${Number(id)}`;
  const row = rows[0] as Record<string, unknown> | undefined;
  if (!row) {
    return NextResponse.json({ error: "Fila no encontrada" }, { status: 404, headers: NO_CACHE });
  }

  const today = new Date().toISOString().slice(0, 10);

  const prompt = `Eres un asistente que extrae datos estructurados de promociones bancarias chilenas.
Dado el texto de condiciones y los datos ya parseados de una promo, devuelve los valores correctos para TODOS los campos.
Hoy es ${today}. Los días de semana usan índices (0=domingo, 1=lunes, ..., 6=sábado).

DATOS SCRAPEADOS (pueden tener errores o estar incompletos):
- Comercio: ${row.merchant_name ?? ""}
- Banco: ${row.bank_id ?? ""}
- Descuento %: ${row.discount ?? "null"}
- Descuento por litro: ${row.discount_per_unit ?? "null"}
- Tope (CLP): ${row.cap ?? "null"}
- Compra mínima (CLP): ${row.min_purchase ?? "null"}
- Modalidad: ${row.modality ?? "null"} (valores válidos: presencial, online, both)
- Fecha inicio: ${row.start_date ? String(row.start_date).slice(0, 10) : "null"}
- Fecha fin: ${row.end_date ? String(row.end_date).slice(0, 10) : "null"}
- Días: ${Array.isArray(row.days_of_week) ? (row.days_of_week as number[]).map((d) => DAYS_ES[d]).join(", ") || "todos" : "todos"}
- Tipos de tarjeta: ${Array.isArray(row.card_types) ? (row.card_types as string[]).join(", ") : ""}
- Tarjetas origen (texto crudo del banco): ${Array.isArray(row.source_cards) ? (row.source_cards as string[]).join(", ") || "no especificado" : "no especificado"}
- Apilable: ${row.stackable ?? false}
- Fuente: ${row.source ?? ""}

TEXTO DE CONDICIONES (fuente primaria de verdad):
${row.conditions ?? "(sin condiciones)"}

INSTRUCCIONES:
- Extrae o confirma cada campo usando el texto de condiciones como fuente principal.
- Si el texto menciona "miércoles", days_of_week debe ser [3]. Si menciona "lunes y martes", [1,2]. Si dice "todos los días", [].
- Si menciona "presencial" o "tienda" o "local", modality="presencial". Si dice "app" o "web" o "online", modality="online". Si dice ambos, modality="both".
- Si menciona "acumulable" o "combinable", stackable=true.
- Si menciona un código (ej: "con código VERANO25"), extráelo en code.
- Para fechas: usa formato YYYY-MM-DD. Si dice "hasta el 30 de junio", end_date="${today.slice(0, 4)}-06-30".
- card_types debe ser un subconjunto de ["credit","debit","prepaid"] según lo que aplique.
- Si discount es null pero hay descuento por litro (bencina), usa discount_per_unit.
- Las condiciones en el campo "conditions" deben estar limpias y en español, sin HTML.

Responde SOLO con este JSON exacto (sin texto adicional):
{
  "discount": <número 1-100 o null>,
  "discount_per_unit": <número o null>,
  "discount_unit": <"liter" o null>,
  "cap": <número entero CLP o null>,
  "min_purchase": <número entero CLP o null>,
  "modality": <"presencial" | "online" | "both">,
  "start_date": <"YYYY-MM-DD" o null>,
  "end_date": <"YYYY-MM-DD" o null>,
  "days_of_week": <array de 0-6, vacío = todos los días>,
  "code": <string o null>,
  "conditions": <texto limpio de condiciones o null>,
  "card_types": <array con "credit","debit","prepaid">,
  "stackable": <true | false>
}`;

  try {
    const result = await generateJSON<{
      discount: number | null;
      discount_per_unit: number | null;
      discount_unit: string | null;
      cap: number | null;
      min_purchase: number | null;
      modality: string;
      start_date: string | null;
      end_date: string | null;
      days_of_week: number[];
      code: string | null;
      conditions: string | null;
      card_types: string[];
      stackable: boolean;
    }>(prompt);

    // Sanitizar la respuesta antes de devolverla
    const safe = {
      discount:          typeof result.discount === "number" ? result.discount : null,
      discount_per_unit: typeof result.discount_per_unit === "number" ? result.discount_per_unit : null,
      discount_unit:     result.discount_unit === "liter" ? "liter" : null,
      cap:               typeof result.cap === "number" ? result.cap : null,
      min_purchase:      typeof result.min_purchase === "number" ? result.min_purchase : null,
      modality:          ["presencial", "online", "both"].includes(result.modality) ? result.modality : "presencial",
      start_date:        typeof result.start_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(result.start_date) ? result.start_date : null,
      end_date:          typeof result.end_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(result.end_date) ? result.end_date : null,
      days_of_week:      Array.isArray(result.days_of_week) ? result.days_of_week.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6) : [],
      code:              typeof result.code === "string" && result.code.trim() ? result.code.trim() : null,
      conditions:        typeof result.conditions === "string" && result.conditions.trim() ? result.conditions.trim() : null,
      card_types:        Array.isArray(result.card_types) ? result.card_types.filter((t) => ["credit", "debit", "prepaid"].includes(t)) : ["credit"],
      stackable:         result.stackable === true,
    };

    return NextResponse.json(safe, { headers: NO_CACHE });
  } catch (err) {
    console.error("autofill failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "La IA no pudo procesar la promo" }, { status: 500, headers: NO_CACHE });
  }
}
