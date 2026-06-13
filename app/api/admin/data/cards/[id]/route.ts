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
    const rows = await sql`SELECT id, bank_id, name, type FROM cards WHERE id = ${id}`;
    if (!rows.length) return NextResponse.json(null, { status: 404, headers: NO_CACHE });
    return NextResponse.json(rows[0], { headers: NO_CACHE });
  } catch (err) {
    console.error("GET /api/admin/data/cards/[id] failed:", err);
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
    const { name, bank_id, type } = body ?? {};

    const rows = await sql`SELECT id FROM cards WHERE id = ${id}`;
    if (!rows.length) return NextResponse.json(null, { status: 404, headers: NO_CACHE });

    if (name !== undefined) await sql`UPDATE cards SET name = ${name} WHERE id = ${id}`;
    if (bank_id !== undefined) {
      if (!isValidId(bank_id)) return NextResponse.json({ error: "bank_id inválido" }, { status: 400, headers: NO_CACHE });
      await sql`UPDATE cards SET bank_id = ${bank_id} WHERE id = ${id}`;
    }
    if (type !== undefined) {
      if (type !== "credit" && type !== "debit") return NextResponse.json({ error: "type inválido" }, { status: 400, headers: NO_CACHE });
      await sql`UPDATE cards SET type = ${type} WHERE id = ${id}`;
    }
    return NextResponse.json({ status: "ok" }, { headers: NO_CACHE });
  } catch (err) {
    console.error("PATCH /api/admin/data/cards/[id] failed:", err);
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
    await sql`DELETE FROM cards WHERE id = ${id}`;
    return NextResponse.json({ status: "ok" }, { headers: NO_CACHE });
  } catch (err) {
    console.error("DELETE /api/admin/data/cards/[id] failed:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500, headers: NO_CACHE });
  }
}
