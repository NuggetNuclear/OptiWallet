import { sql } from "@/lib/db";
import { requireAdmin, clientIp } from "@/lib/admin-guard";
import { logAdminAction } from "@/lib/admin-log";
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
    const rows = await sql`SELECT id, bank_id, name, type FROM cards WHERE id = ${id}`;
    if (!rows.length) return NextResponse.json(null, { status: 404, headers: NO_CACHE });
    return NextResponse.json(rows[0], { headers: NO_CACHE });
  } catch (err) {
    console.error("GET /api/admin/data/cards/[id] failed:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500, headers: NO_CACHE });
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await requireAdmin(req);
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401, headers: NO_CACHE });
  }
  const { id } = await params;
  if (!isValidId(id)) return NextResponse.json({ error: "ID inválido" }, { status: 400, headers: NO_CACHE });
  try {
    const body = await req.json().catch(() => null);
    const fields: Record<string, unknown> = body ?? {};
    const has = (k: string) => Object.prototype.hasOwnProperty.call(fields, k);

    if (has("name") && (typeof fields.name !== "string" || !fields.name.trim())) return NextResponse.json({ error: "name inválido" }, { status: 400, headers: NO_CACHE });
    if (has("bank_id") && !isValidId(fields.bank_id as string)) return NextResponse.json({ error: "bank_id inválido" }, { status: 400, headers: NO_CACHE });
    if (has("type") && fields.type !== "credit" && fields.type !== "debit") return NextResponse.json({ error: "type inválido" }, { status: 400, headers: NO_CACHE });

    const changed = ["name", "bank_id", "type"].filter(has);
    const rows = await sql`SELECT id, bank_id, name, type FROM cards WHERE id = ${id}`;
    if (!rows.length) return NextResponse.json(null, { status: 404, headers: NO_CACHE });
    if (!changed.length) return NextResponse.json({ status: "ok" }, { headers: NO_CACHE });

    const cur = rows[0] as Record<string, unknown>;
    const next = {
      name:    has("name") ? fields.name : cur.name,
      bank_id: has("bank_id") ? fields.bank_id : cur.bank_id,
      type:    has("type") ? fields.type : cur.type,
    };

    // Single atomic UPDATE — no partial-write window. (audit L4)
    await sql`
      UPDATE cards SET
        name = ${next.name as string},
        bank_id = ${next.bank_id as string},
        type = ${next.type as string}
      WHERE id = ${id}
    `;

    await logAdminAction(session, "update", "card", id, `Campos: ${changed.join(", ")}`, clientIp(req));
    return NextResponse.json({ status: "ok" }, { headers: NO_CACHE });
  } catch (err) {
    console.error("PATCH /api/admin/data/cards/[id] failed:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500, headers: NO_CACHE });
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await requireAdmin(req);
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401, headers: NO_CACHE });
  }
  const { id } = await params;
  if (!isValidId(id)) return NextResponse.json({ error: "ID inválido" }, { status: 400, headers: NO_CACHE });
  try {
    const nameRow = await sql`SELECT name FROM cards WHERE id = ${id}`;
    await sql`DELETE FROM cards WHERE id = ${id}`;
    await logAdminAction(session, "delete", "card", id, `Tarjeta "${nameRow[0]?.name ?? id}" eliminada`, clientIp(req));
    return NextResponse.json({ status: "ok" }, { headers: NO_CACHE });
  } catch (err) {
    console.error("DELETE /api/admin/data/cards/[id] failed:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500, headers: NO_CACHE });
  }
}
