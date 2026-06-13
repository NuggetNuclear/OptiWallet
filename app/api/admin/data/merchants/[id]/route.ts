import { sql } from "@/lib/db";
import { getAdminFromRequest } from "@/lib/admin-session";
import { isValidId } from "@/lib/validate";
import { NextRequest, NextResponse } from "next/server";

const NO_CACHE = { "Cache-Control": "no-store" };
type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  if (!await getAdminFromRequest(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401, headers: NO_CACHE });
  }
  const { id } = await params;
  if (!isValidId(id)) return NextResponse.json({ error: "ID inválido" }, { status: 400, headers: NO_CACHE });
  try {
    const rows = await sql`
      SELECT m.id, m.name, m.category_id, m.aliases, mc.label AS category_label, mc.emoji
      FROM merchants m
      JOIN merchant_categories mc ON m.category_id = mc.id
      WHERE m.id = ${id}
    `;
    if (!rows.length) return NextResponse.json(null, { status: 404, headers: NO_CACHE });
    return NextResponse.json(rows[0], { headers: NO_CACHE });
  } catch (err) {
    console.error("GET /api/admin/data/merchants/[id] failed:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500, headers: NO_CACHE });
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  if (!await getAdminFromRequest(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401, headers: NO_CACHE });
  }
  const { id } = await params;
  if (!isValidId(id)) return NextResponse.json({ error: "ID inválido" }, { status: 400, headers: NO_CACHE });
  try {
    const body = await req.json().catch(() => null);
    const { name, category_id, aliases } = body ?? {};

    const rows = await sql`SELECT id FROM merchants WHERE id = ${id}`;
    if (!rows.length) return NextResponse.json(null, { status: 404, headers: NO_CACHE });

    if (name !== undefined) await sql`UPDATE merchants SET name = ${name} WHERE id = ${id}`;
    if (category_id !== undefined) {
      if (!isValidId(category_id)) return NextResponse.json({ error: "category_id inválido" }, { status: 400, headers: NO_CACHE });
      await sql`UPDATE merchants SET category_id = ${category_id} WHERE id = ${id}`;
    }
    if (aliases !== undefined) {
      const aliasArray = Array.isArray(aliases) ? aliases.filter((a: unknown) => typeof a === "string") : [];
      await sql`UPDATE merchants SET aliases = ${aliasArray} WHERE id = ${id}`;
    }
    return NextResponse.json({ status: "ok" }, { headers: NO_CACHE });
  } catch (err) {
    console.error("PATCH /api/admin/data/merchants/[id] failed:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500, headers: NO_CACHE });
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  if (!await getAdminFromRequest(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401, headers: NO_CACHE });
  }
  const { id } = await params;
  if (!isValidId(id)) return NextResponse.json({ error: "ID inválido" }, { status: 400, headers: NO_CACHE });
  try {
    const confirmed = req.nextUrl.searchParams.get("confirmed") === "true";
    if (!confirmed) {
      const promotions = await sql`SELECT id FROM promotions WHERE merchant_id = ${id}`;
      if (promotions.length) {
        return NextResponse.json(
          { error: "Tiene dependencias", promotions },
          { status: 409, headers: NO_CACHE },
        );
      }
    }
    await sql`DELETE FROM merchants WHERE id = ${id}`;
    return NextResponse.json({ status: "ok" }, { headers: NO_CACHE });
  } catch (err) {
    console.error("DELETE /api/admin/data/merchants/[id] failed:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500, headers: NO_CACHE });
  }
}
