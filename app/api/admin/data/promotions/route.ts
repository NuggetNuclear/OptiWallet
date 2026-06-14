import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-guard";
import { isValidId } from "@/lib/validate";
import { NextRequest, NextResponse } from "next/server";

const NO_CACHE = { "Cache-Control": "no-store" };

export async function GET(req: NextRequest) {
  if (!await requireAdmin(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401, headers: NO_CACHE });
  }
  try {
    const bankId     = req.nextUrl.searchParams.get("bankId");
    const merchantId = req.nextUrl.searchParams.get("merchantId");
    const activeOnly = req.nextUrl.searchParams.get("active") === "true";

    if (bankId     && !isValidId(bankId))     return NextResponse.json({ error: "bankId inválido" },     { status: 400, headers: NO_CACHE });
    if (merchantId && !isValidId(merchantId)) return NextResponse.json({ error: "merchantId inválido" }, { status: 400, headers: NO_CACHE });

    const rows = await sql`
      SELECT
        p.id, p.bank_id, p.card_types, p.merchant_id, p.discount, p.cap, p.min_purchase,
        p.days_of_week, p.start_date, p.end_date, p.modality, p.code, p.conditions,
        p.source, p.verified_at, p.active, p.created_at, p.updated_at,
        b.name AS bank_name, m.name AS merchant_name
      FROM promotions p
      JOIN banks     b ON p.bank_id     = b.id
      JOIN merchants m ON p.merchant_id = m.id
      WHERE (${bankId     ?? ""} = '' OR p.bank_id     = ${bankId     ?? ""})
        AND (${merchantId ?? ""} = '' OR p.merchant_id = ${merchantId ?? ""})
        AND (${activeOnly} = false OR p.active = true)
      ORDER BY p.discount DESC, p.id
    `;
    return NextResponse.json(rows, { headers: NO_CACHE });
  } catch (err) {
    console.error("GET /api/admin/data/promotions failed:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500, headers: NO_CACHE });
  }
}

export async function POST(req: NextRequest) {
  if (!await requireAdmin(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401, headers: NO_CACHE });
  }
  try {
    const body = await req.json().catch(() => null);
    const {
      id, bank_id, card_types, merchant_id, discount, cap, min_purchase,
      days_of_week, start_date, end_date, modality, code, conditions,
      source, verified_at, active,
    } = body ?? {};

    if (!id || !isValidId(id)) return NextResponse.json({ error: "ID inválido" }, { status: 400, headers: NO_CACHE });
    if (!bank_id || !isValidId(bank_id)) return NextResponse.json({ error: "bank_id inválido" }, { status: 400, headers: NO_CACHE });
    if (!merchant_id || !isValidId(merchant_id)) return NextResponse.json({ error: "merchant_id inválido" }, { status: 400, headers: NO_CACHE });
    if (!Array.isArray(card_types) || !card_types.length) return NextResponse.json({ error: "card_types requerido" }, { status: 400, headers: NO_CACHE });
    if (typeof discount !== "number" || discount < 1 || discount > 100) return NextResponse.json({ error: "discount debe ser 1-100" }, { status: 400, headers: NO_CACHE });
    if (!["presencial", "online", "both"].includes(modality)) return NextResponse.json({ error: "modality inválido" }, { status: 400, headers: NO_CACHE });
    if (!source) return NextResponse.json({ error: "source requerido" }, { status: 400, headers: NO_CACHE });
    if (!verified_at) return NextResponse.json({ error: "verified_at requerido" }, { status: 400, headers: NO_CACHE });

    await sql`
      INSERT INTO promotions (
        id, bank_id, card_types, merchant_id, discount, cap, min_purchase,
        days_of_week, start_date, end_date, modality, code, conditions,
        source, verified_at, active
      ) VALUES (
        ${id}, ${bank_id}, ${card_types}, ${merchant_id},
        ${discount}, ${cap ?? null}, ${min_purchase ?? null},
        ${days_of_week ?? []}, ${start_date ?? null}, ${end_date ?? null},
        ${modality}, ${code ?? null}, ${conditions ?? null},
        ${source}, ${verified_at}::date, ${active ?? true}
      )
    `;
    return NextResponse.json({ id }, { status: 201, headers: NO_CACHE });
  } catch (err) {
    console.error("POST /api/admin/data/promotions failed:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500, headers: NO_CACHE });
  }
}
