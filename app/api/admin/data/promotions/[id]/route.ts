import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-guard";
import { isValidId } from "@/lib/validate";
import { NextRequest, NextResponse } from "next/server";

const NO_CACHE = { "Cache-Control": "no-store" };
type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  if (!await requireAdmin(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401, headers: NO_CACHE });
  }
  const { id } = await params;
  if (!isValidId(id)) return NextResponse.json({ error: "ID inválido" }, { status: 400, headers: NO_CACHE });
  try {
    const rows = await sql`
      SELECT
        p.id, p.bank_id, p.card_types, p.merchant_id, p.discount, p.cap, p.min_purchase,
        p.days_of_week, p.start_date, p.end_date, p.modality, p.code, p.conditions,
        p.source, p.verified_at, p.active, p.created_at, p.updated_at,
        b.name AS bank_name, m.name AS merchant_name
      FROM promotions p
      JOIN banks     b ON p.bank_id     = b.id
      JOIN merchants m ON p.merchant_id = m.id
      WHERE p.id = ${id}
    `;
    if (!rows.length) return NextResponse.json(null, { status: 404, headers: NO_CACHE });
    return NextResponse.json(rows[0], { headers: NO_CACHE });
  } catch (err) {
    console.error("GET /api/admin/data/promotions/[id] failed:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500, headers: NO_CACHE });
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  if (!await requireAdmin(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401, headers: NO_CACHE });
  }
  const { id } = await params;
  if (!isValidId(id)) return NextResponse.json({ error: "ID inválido" }, { status: 400, headers: NO_CACHE });
  try {
    const body = await req.json().catch(() => null);

    const rows = await sql`SELECT id FROM promotions WHERE id = ${id}`;
    if (!rows.length) return NextResponse.json(null, { status: 404, headers: NO_CACHE });

    const fields = body ?? {};
    const allowed = [
      "bank_id", "card_types", "merchant_id", "discount", "cap", "min_purchase",
      "days_of_week", "start_date", "end_date", "modality", "code", "conditions",
      "source", "verified_at", "active",
    ] as const;

    for (const field of allowed) {
      if (!(field in fields)) continue;
      const val = fields[field];
      switch (field) {
        case "bank_id":
          if (!isValidId(val)) return NextResponse.json({ error: "bank_id inválido" }, { status: 400, headers: NO_CACHE });
          await sql`UPDATE promotions SET bank_id = ${val}, updated_at = now() WHERE id = ${id}`;
          break;
        case "merchant_id":
          if (!isValidId(val)) return NextResponse.json({ error: "merchant_id inválido" }, { status: 400, headers: NO_CACHE });
          await sql`UPDATE promotions SET merchant_id = ${val}, updated_at = now() WHERE id = ${id}`;
          break;
        case "discount":
          if (typeof val !== "number" || val < 1 || val > 100) return NextResponse.json({ error: "discount inválido" }, { status: 400, headers: NO_CACHE });
          await sql`UPDATE promotions SET discount = ${val}, updated_at = now() WHERE id = ${id}`;
          break;
        case "modality":
          if (!["presencial", "online", "both"].includes(val)) return NextResponse.json({ error: "modality inválido" }, { status: 400, headers: NO_CACHE });
          await sql`UPDATE promotions SET modality = ${val}, updated_at = now() WHERE id = ${id}`;
          break;
        case "card_types":
          await sql`UPDATE promotions SET card_types = ${val}, updated_at = now() WHERE id = ${id}`;
          break;
        case "days_of_week":
          await sql`UPDATE promotions SET days_of_week = ${val}, updated_at = now() WHERE id = ${id}`;
          break;
        case "start_date":
          await sql`UPDATE promotions SET start_date = ${val ?? null}, updated_at = now() WHERE id = ${id}`;
          break;
        case "end_date":
          await sql`UPDATE promotions SET end_date = ${val ?? null}, updated_at = now() WHERE id = ${id}`;
          break;
        case "cap":
          await sql`UPDATE promotions SET cap = ${val ?? null}, updated_at = now() WHERE id = ${id}`;
          break;
        case "min_purchase":
          await sql`UPDATE promotions SET min_purchase = ${val ?? null}, updated_at = now() WHERE id = ${id}`;
          break;
        case "code":
          await sql`UPDATE promotions SET code = ${val ?? null}, updated_at = now() WHERE id = ${id}`;
          break;
        case "conditions":
          await sql`UPDATE promotions SET conditions = ${val ?? null}, updated_at = now() WHERE id = ${id}`;
          break;
        case "source":
          await sql`UPDATE promotions SET source = ${val}, updated_at = now() WHERE id = ${id}`;
          break;
        case "verified_at":
          await sql`UPDATE promotions SET verified_at = ${val}::date, updated_at = now() WHERE id = ${id}`;
          break;
        case "active":
          await sql`UPDATE promotions SET active = ${val}, updated_at = now() WHERE id = ${id}`;
          break;
      }
    }

    return NextResponse.json({ status: "ok" }, { headers: NO_CACHE });
  } catch (err) {
    console.error("PATCH /api/admin/data/promotions/[id] failed:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500, headers: NO_CACHE });
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  if (!await requireAdmin(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401, headers: NO_CACHE });
  }
  const { id } = await params;
  if (!isValidId(id)) return NextResponse.json({ error: "ID inválido" }, { status: 400, headers: NO_CACHE });
  try {
    await sql`DELETE FROM promotions WHERE id = ${id}`;
    return NextResponse.json({ status: "ok" }, { headers: NO_CACHE });
  } catch (err) {
    console.error("DELETE /api/admin/data/promotions/[id] failed:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500, headers: NO_CACHE });
  }
}
