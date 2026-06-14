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
    const rows = await sql`SELECT id, name, short_name, available FROM banks WHERE id = ${id}`;
    if (!rows.length) return NextResponse.json(null, { status: 404, headers: NO_CACHE });
    return NextResponse.json(rows[0], { headers: NO_CACHE });
  } catch (err) {
    console.error("GET /api/admin/data/banks/[id] failed:", err);
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
    const { name, short_name, available } = body ?? {};

    const rows = await sql`SELECT id, name FROM banks WHERE id = ${id}`;
    if (!rows.length) return NextResponse.json(null, { status: 404, headers: NO_CACHE });

    const changes: string[] = [];
    if (name !== undefined) {
      await sql`UPDATE banks SET name = ${name} WHERE id = ${id}`;
      changes.push(`name="${name}"`);
    }
    if (short_name !== undefined) {
      await sql`UPDATE banks SET short_name = ${short_name ?? null} WHERE id = ${id}`;
      changes.push(`short_name="${short_name ?? ""}"`);
    }
    if (available !== undefined) {
      await sql`UPDATE banks SET available = ${available} WHERE id = ${id}`;
      changes.push(`available=${available}`);
    }

    if (changes.length) {
      await logAdminAction(session, "update", "bank", id, changes.join(", "), clientIp(req));
    }
    return NextResponse.json({ status: "ok" }, { headers: NO_CACHE });
  } catch (err) {
    console.error("PATCH /api/admin/data/banks/[id] failed:", err);
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
    const confirmed = req.nextUrl.searchParams.get("confirmed") === "true";
    if (!confirmed) {
      const [cards, promos] = await Promise.all([
        sql`SELECT id, name FROM cards WHERE bank_id = ${id}`,
        sql`SELECT id FROM promotions WHERE bank_id = ${id}`,
      ]);
      if (cards.length || promos.length) {
        return NextResponse.json(
          { error: "Tiene dependencias", cards, promotions: promos },
          { status: 409, headers: NO_CACHE },
        );
      }
    }
    const nameRow = await sql`SELECT name FROM banks WHERE id = ${id}`;
    await sql`DELETE FROM banks WHERE id = ${id}`;
    await logAdminAction(session, "delete", "bank", id, `Banco "${nameRow[0]?.name ?? id}" eliminado`, clientIp(req));
    return NextResponse.json({ status: "ok" }, { headers: NO_CACHE });
  } catch (err) {
    console.error("DELETE /api/admin/data/banks/[id] failed:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500, headers: NO_CACHE });
  }
}
