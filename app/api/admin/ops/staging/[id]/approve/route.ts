import { sql } from "@/lib/db";
import { requireAdmin, clientIp } from "@/lib/admin-guard";
import { logAdminAction } from "@/lib/admin-log";
import {
  isValidId,
  isValidCardTypes,
  isValidDaysOfWeek,
  isNonNegativeIntOrNull,
  isValidDateOrNull,
  isValidDiscountConfig,
} from "@/lib/validate";
import { promoId, MERCHANT_NAME_MAX_LENGTH } from "@/lib/staging";
import { NextRequest, NextResponse } from "next/server";

const NO_CACHE = { "Cache-Control": "no-store" };

/**
 * POST /api/admin/ops/staging/[id]/approve
 *
 * Aprueba una promo en staging → la inserta en `promotions`. Resuelve el
 * comercio: lo mapea a uno existente o crea uno nuevo en el acto. Permite
 * overrides de campos antes de insertar (el revisor corrige lo que el parser
 * dejó dudoso). Idempotente-seguro: solo procesa filas en estado 'pending'.
 *
 * Body: {
 *   merchant_mode: "existing" | "new",
 *   merchant_id?: string,
 *   new_merchant?: { id, name, category_id, aliases? },
 *   overrides?: { discount, cap, min_purchase, days_of_week, card_types,
 *                 modality, start_date, end_date, stackable, code, conditions }
 * }
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin(req);
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401, headers: NO_CACHE });
  }
  try {
    const { id } = await params;
    if (!/^\d+$/.test(id)) {
      return NextResponse.json({ error: "id inválido" }, { status: 400, headers: NO_CACHE });
    }

    const stagedRows = await sql`SELECT * FROM promo_staging WHERE id = ${Number(id)}`;
    const staged = stagedRows[0] as Record<string, unknown> | undefined;
    if (!staged) {
      return NextResponse.json({ error: "Fila de staging no encontrada" }, { status: 404, headers: NO_CACHE });
    }
    if (staged.status !== "pending") {
      return NextResponse.json({ error: `Esta fila ya fue ${staged.status === "approved" ? "aprobada" : "rechazada"}` }, { status: 409, headers: NO_CACHE });
    }

    const body = await req.json().catch(() => ({}));
    const bankId = staged.bank_id as string;

    // ── Resolver comercio ────────────────────────────────────────────────────
    let merchantId: string;
    if (body.merchant_mode === "new") {
      const nm = body.new_merchant ?? {};
      if (!nm.id || !isValidId(nm.id)) {
        return NextResponse.json({ error: "ID de comercio nuevo inválido (slug)" }, { status: 400, headers: NO_CACHE });
      }
      if (typeof nm.name !== "string" || !nm.name.trim()) {
        return NextResponse.json({ error: "Nombre de comercio requerido" }, { status: 400, headers: NO_CACHE });
      }
      if (nm.name.trim().length > MERCHANT_NAME_MAX_LENGTH) {
        return NextResponse.json({ error: `El nombre del comercio no puede superar ${MERCHANT_NAME_MAX_LENGTH} caracteres` }, { status: 400, headers: NO_CACHE });
      }
      if (!nm.category_id || !isValidId(nm.category_id)) {
        return NextResponse.json({ error: "category_id inválido" }, { status: 400, headers: NO_CACHE });
      }
      const [exists, cat] = await Promise.all([
        sql`SELECT id FROM merchants WHERE id = ${nm.id}`,
        sql`SELECT id FROM merchant_categories WHERE id = ${nm.category_id}`,
      ]);
      if (exists.length > 0) {
        return NextResponse.json({ error: `Ya existe un comercio con id '${nm.id}'` }, { status: 409, headers: NO_CACHE });
      }
      if (cat.length === 0) {
        return NextResponse.json({ error: `La categoría '${nm.category_id}' no existe` }, { status: 400, headers: NO_CACHE });
      }
      const aliases = Array.isArray(nm.aliases) ? nm.aliases.filter((a: unknown) => typeof a === "string") : [];
      await sql`INSERT INTO merchants (id, name, category_id, aliases) VALUES (${nm.id}, ${nm.name.trim()}, ${nm.category_id}, ${aliases})`;
      await logAdminAction(session, "create", "merchant", nm.id, `Comercio creado desde staging: ${nm.name}`, clientIp(req));
      merchantId = nm.id;
    } else {
      merchantId = body.merchant_id;
      if (!merchantId || !isValidId(merchantId)) {
        return NextResponse.json({ error: "merchant_id inválido" }, { status: 400, headers: NO_CACHE });
      }
      const m = await sql`SELECT id FROM merchants WHERE id = ${merchantId}`;
      if (m.length === 0) {
        return NextResponse.json({ error: `El comercio '${merchantId}' no existe` }, { status: 400, headers: NO_CACHE });
      }
    }

    // ── Campos finales (staged + overrides del revisor) ───────────────────────
    const o = body.overrides ?? {};
    const pick = <T>(key: string, fallback: T): T => (o[key] !== undefined ? o[key] : fallback);

    const discount          = pick("discount", staged.discount) as number | null;
    const discount_per_unit = pick("discount_per_unit", staged.discount_per_unit) as number | null;
    const discount_unit     = pick("discount_unit", staged.discount_unit) as string | null;
    const cap               = pick("cap", staged.cap) as number | null;
    const min_purchase      = pick("min_purchase", staged.min_purchase) as number | null;
    const days_of_week      = pick("days_of_week", staged.days_of_week) as number[];
    const card_types        = pick("card_types", staged.card_types) as string[];
    const card_ids          = pick("card_ids", staged.card_ids) as string[];
    const modality          = pick("modality", staged.modality) as string;
    const start_date        = pick("start_date", staged.start_date) as string | null;
    const end_date          = pick("end_date", staged.end_date) as string | null;
    const stackable         = pick("stackable", staged.stackable) as boolean;
    const code              = pick("code", staged.code) as string | null;
    const conditions        = pick("conditions", staged.conditions) as string | null;
    const source            = (staged.source as string) || "";

    // ── Verificaciones (mismas reglas que el CRUD de promociones) ─────────────
    if (!isValidDiscountConfig({ discount, discount_per_unit, discount_unit })) {
      return NextResponse.json({ error: "Descuento inválido: especifica % (1-100) o $/unidad, no ambos" }, { status: 400, headers: NO_CACHE });
    }
    if (!isValidCardTypes(card_types)) {
      return NextResponse.json({ error: "card_types debe tener al menos un tipo válido" }, { status: 400, headers: NO_CACHE });
    }
    if (!["presencial", "online", "both"].includes(modality)) {
      return NextResponse.json({ error: "modality inválido" }, { status: 400, headers: NO_CACHE });
    }
    if (!isValidDaysOfWeek(days_of_week)) {
      return NextResponse.json({ error: "days_of_week debe ser enteros 0-6" }, { status: 400, headers: NO_CACHE });
    }
    if (!isNonNegativeIntOrNull(cap) || !isNonNegativeIntOrNull(min_purchase)) {
      return NextResponse.json({ error: "cap/min_purchase deben ser enteros ≥ 0 o null" }, { status: 400, headers: NO_CACHE });
    }
    const toDateStr = (v: unknown): string | null => {
      if (v === null || v === undefined) return null;
      if (v instanceof Date) return v.toISOString().slice(0, 10);
      return String(v).slice(0, 10);
    };
    const sd = start_date ? toDateStr(start_date) : null;
    const ed = end_date ? toDateStr(end_date) : null;
    if (!isValidDateOrNull(sd) || !isValidDateOrNull(ed)) {
      return NextResponse.json({ error: "Fechas inválidas (YYYY-MM-DD)" }, { status: 400, headers: NO_CACHE });
    }
    if (sd && ed && ed < sd) {
      return NextResponse.json({ error: "end_date no puede ser anterior a start_date" }, { status: 400, headers: NO_CACHE });
    }
    if (!source.trim()) {
      return NextResponse.json({ error: "La promo no tiene fuente (source)" }, { status: 400, headers: NO_CACHE });
    }

    // ── Resolver newPromoId con bchile-slug y deduplicación por colisión ──
    let newPromoId = bankId === "banco-chile"
      ? `bchile-${merchantId}`.slice(0, 64)
      : promoId(bankId, merchantId, staged.fingerprint as string);

    const dupe = await sql`SELECT id FROM promotions WHERE id = ${newPromoId}`;
    if (dupe.length > 0) {
      if (bankId === "banco-chile") {
        // Colisión: Añadir hash del fingerprint
        newPromoId = `${newPromoId.slice(0, 55)}-${(staged.fingerprint as string).slice(0, 8)}`;
        const secondDupe = await sql`SELECT id FROM promotions WHERE id = ${newPromoId}`;
        if (secondDupe.length > 0) {
          return NextResponse.json({ error: `Ya existe una promoción con id '${newPromoId}' (duplicado absoluto)` }, { status: 409, headers: NO_CACHE });
        }
      } else {
        return NextResponse.json({ error: `Ya existe una promoción con id '${newPromoId}' (posible duplicado)` }, { status: 409, headers: NO_CACHE });
      }
    }
    const today = new Date().toISOString().slice(0, 10);

    // Insertar en promotions
    await sql`
      INSERT INTO promotions (
        id, bank_id, card_types, card_ids, merchant_id,
        discount, discount_per_unit, discount_unit, stackable,
        cap, min_purchase, days_of_week, start_date, end_date,
        modality, code, conditions, source, verified_at, active
      ) VALUES (
        ${newPromoId}, ${bankId}, ${card_types}, ${card_ids}, ${merchantId},
        ${discount ?? null}, ${discount_per_unit ?? null}, ${discount_unit ?? null}, ${stackable ?? false},
        ${cap ?? null}, ${min_purchase ?? null}, ${days_of_week ?? []}, ${sd}, ${ed},
        ${modality}, ${code ?? null}, ${conditions ?? null}, ${source}, ${today}::date, true
      )
    `;

    // Insertar en promotion_codes como default
    if (code) {
      await sql`
        INSERT INTO promotion_codes (promotion_id, code, start_date, end_date)
        VALUES (${newPromoId}, ${code}, ${sd ? sd : today}::date, ${ed ? ed : '9999-12-31'}::date)
      `;
    }

    await sql`
      UPDATE promo_staging
      SET status = 'approved', merchant_id = ${merchantId}, created_promo_id = ${newPromoId},
          reviewed_at = now(), reviewed_by = ${session.email}
      WHERE id = ${Number(id)}
    `;

    const label = discount != null ? `${discount}%` : `$${discount_per_unit}/L`;
    await logAdminAction(session, "approve", "promotion", newPromoId, `Aprobada desde staging #${id}: ${label} en ${merchantId} (${bankId})`, clientIp(req));

    return NextResponse.json({ promo_id: newPromoId, merchant_id: merchantId }, { status: 201, headers: NO_CACHE });
  } catch (err) {
    console.error("POST /api/admin/ops/staging/[id]/approve failed:", err);
    return NextResponse.json({ error: "Error interno al aprobar" }, { status: 500, headers: NO_CACHE });
  }
}
