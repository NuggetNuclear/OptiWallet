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
    const rows = await sql`SELECT id, name, short_name, available, color FROM banks WHERE id = ${id}`;
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
    const fields: Record<string, unknown> = body ?? {};
    const has = (k: string) => Object.prototype.hasOwnProperty.call(fields, k);

    if (has("name") && (typeof fields.name !== "string" || !fields.name.trim())) return NextResponse.json({ error: "name inválido" }, { status: 400, headers: NO_CACHE });
    if (has("short_name") && fields.short_name !== null && typeof fields.short_name !== "string") return NextResponse.json({ error: "short_name inválido" }, { status: 400, headers: NO_CACHE });
    if (has("available") && typeof fields.available !== "boolean") return NextResponse.json({ error: "available inválido" }, { status: 400, headers: NO_CACHE });
    if (has("color") && fields.color !== null && (typeof fields.color !== "string" || !/^#[0-9A-Fa-f]{6}$/.test(fields.color))) return NextResponse.json({ error: "color inválido" }, { status: 400, headers: NO_CACHE });

    const changed = ["name", "short_name", "available", "color"].filter(has);
    const rows = await sql`SELECT id, name, short_name, available, color FROM banks WHERE id = ${id}`;
    if (!rows.length) return NextResponse.json(null, { status: 404, headers: NO_CACHE });
    if (!changed.length) return NextResponse.json({ status: "ok" }, { headers: NO_CACHE });

    const cur = rows[0] as Record<string, unknown>;
    const next = {
      name:       has("name") ? fields.name : cur.name,
      short_name: has("short_name") ? (fields.short_name ?? null) : cur.short_name,
      available:  has("available") ? fields.available : cur.available,
      color:      has("color") ? (fields.color ?? null) : cur.color,
    };

    // Single atomic UPDATE — no partial-write window. (audit L4)
    await sql`
      UPDATE banks SET
        name = ${next.name as string},
        short_name = ${next.short_name as string | null},
        available = ${next.available as boolean},
        color = ${next.color as string | null}
      WHERE id = ${id}
    `;

    await logAdminAction(session, "update", "bank", id, `Campos: ${changed.join(", ")}`, clientIp(req));
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
