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
    if (has("category_id") && !isValidId(fields.category_id as string)) return NextResponse.json({ error: "category_id inválido" }, { status: 400, headers: NO_CACHE });
    if (has("aliases") && !Array.isArray(fields.aliases)) return NextResponse.json({ error: "aliases debe ser un array" }, { status: 400, headers: NO_CACHE });

    const changed = ["name", "category_id", "aliases"].filter(has);
    const rows = await sql`SELECT id, name, category_id, aliases FROM merchants WHERE id = ${id}`;
    if (!rows.length) return NextResponse.json(null, { status: 404, headers: NO_CACHE });
    if (!changed.length) return NextResponse.json({ status: "ok" }, { headers: NO_CACHE });

    const cur = rows[0] as Record<string, unknown>;
    const aliasArray = has("aliases")
      ? (fields.aliases as unknown[]).filter((a): a is string => typeof a === "string")
      : (cur.aliases as string[]);
    const next = {
      name:        has("name") ? fields.name : cur.name,
      category_id: has("category_id") ? fields.category_id : cur.category_id,
      aliases:     aliasArray,
    };

    // Single atomic UPDATE — no partial-write window.
    await sql`
      UPDATE merchants SET
        name = ${next.name as string},
        category_id = ${next.category_id as string},
        aliases = ${next.aliases as string[]}
      WHERE id = ${id}
    `;

    await logAdminAction(session, "update", "merchant", id, `Campos: ${changed.join(", ")}`, clientIp(req));
    return NextResponse.json({ status: "ok" }, { headers: NO_CACHE });
  } catch (err) {
    console.error("PATCH /api/admin/data/merchants/[id] failed:", err);
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
      const promotions = await sql`SELECT id FROM promotions WHERE merchant_id = ${id}`;
      if (promotions.length) {
        return NextResponse.json(
          { error: "Tiene dependencias", promotions },
          { status: 409, headers: NO_CACHE },
        );
      }
    }
    const nameRow = await sql`SELECT name FROM merchants WHERE id = ${id}`;
    await sql`DELETE FROM merchants WHERE id = ${id}`;
    await logAdminAction(session, "delete", "merchant", id, `Comercio "${nameRow[0]?.name ?? id}" eliminado`, clientIp(req));
    return NextResponse.json({ status: "ok" }, { headers: NO_CACHE });
  } catch (err) {
    console.error("DELETE /api/admin/data/merchants/[id] failed:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500, headers: NO_CACHE });
  }
}
