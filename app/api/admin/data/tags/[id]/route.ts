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
    const rows = await sql`SELECT id, label, emoji FROM merchant_tags WHERE id = ${id}`;
    if (!rows.length) return NextResponse.json(null, { status: 404, headers: NO_CACHE });
    return NextResponse.json(rows[0], { headers: NO_CACHE });
  } catch (err) {
    console.error("GET /api/admin/data/tags/[id] failed:", err);
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

    if (has("label") && (typeof fields.label !== "string" || !fields.label.trim()))
      return NextResponse.json({ error: "label inválido" }, { status: 400, headers: NO_CACHE });
    if (has("emoji") && fields.emoji !== null && typeof fields.emoji !== "string")
      return NextResponse.json({ error: "emoji inválido" }, { status: 400, headers: NO_CACHE });

    const rows = await sql`SELECT id, label, emoji FROM merchant_tags WHERE id = ${id}`;
    if (!rows.length) return NextResponse.json(null, { status: 404, headers: NO_CACHE });

    const cur = rows[0] as Record<string, unknown>;
    const newId   = has("new_id") ? String(fields.new_id).trim() : id;
    const cascade = fields.cascade !== false; // default true
    const next = {
      label: has("label") ? String(fields.label).trim() : cur.label as string,
      emoji: has("emoji") ? (fields.emoji ? String(fields.emoji).trim() : null) : (cur.emoji as string | null),
    };

    const renamingId = newId !== id;
    if (renamingId && !isValidId(newId))
      return NextResponse.json({ error: "new_id inválido (slug)" }, { status: 400, headers: NO_CACHE });
    if (renamingId) {
      const exists = await sql`SELECT id FROM merchant_tags WHERE id = ${newId}`;
      if (exists.length) return NextResponse.json({ error: `Ya existe un tag con id '${newId}'` }, { status: 409, headers: NO_CACHE });
    }

    if (renamingId) {
      // La FK merchant_tag_map.tag_id no permite actualizar la PK referenciada,
      // así que replicamos: INSERT → reasignación → DELETE.
      await sql`INSERT INTO merchant_tags (id, label, emoji) VALUES (${newId}, ${next.label}, ${next.emoji})`;
      if (cascade) {
        await sql`UPDATE merchant_tag_map SET tag_id = ${newId} WHERE tag_id = ${id}`;
      }
      await sql`DELETE FROM merchant_tags WHERE id = ${id}`;
      const affected = cascade ? await sql`SELECT COUNT(*)::int AS n FROM merchant_tag_map WHERE tag_id = ${newId}` : [];
      const n = (affected[0] as { n: number } | undefined)?.n ?? 0;
      await logAdminAction(session, "update", "tag", newId,
        `Renombrado de '${id}' → '${newId}'${cascade ? ` (cascade: ${n} comercios)` : " (sin cascade)"}`, clientIp(req));
      return NextResponse.json({ status: "ok", new_id: newId, cascade, merchants_updated: cascade ? n : 0 }, { headers: NO_CACHE });
    }

    const changed = ["label", "emoji"].filter(has);
    if (!changed.length) return NextResponse.json({ status: "ok" }, { headers: NO_CACHE });
    await sql`UPDATE merchant_tags SET label = ${next.label}, emoji = ${next.emoji} WHERE id = ${id}`;
    await logAdminAction(session, "update", "tag", id, `Campos: ${changed.join(", ")}`, clientIp(req));
    return NextResponse.json({ status: "ok" }, { headers: NO_CACHE });
  } catch (err) {
    console.error("PATCH /api/admin/data/tags/[id] failed:", err);
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
      const merchants = await sql`
        SELECT m.id, m.name FROM merchants m
        JOIN merchant_tag_map mtm ON mtm.merchant_id = m.id
        WHERE mtm.tag_id = ${id}
        ORDER BY m.name
      `;
      if (merchants.length) {
        return NextResponse.json(
          { error: "Tiene dependencias", merchants },
          { status: 409, headers: NO_CACHE },
        );
      }
    }
    const labelRow = await sql`SELECT label FROM merchant_tags WHERE id = ${id}`;
    // merchant_tag_map.tag_id es ON DELETE CASCADE → las asociaciones se limpian solas.
    await sql`DELETE FROM merchant_tags WHERE id = ${id}`;
    await logAdminAction(session, "delete", "tag", id, `Tag "${labelRow[0]?.label ?? id}" eliminado`, clientIp(req));
    return NextResponse.json({ status: "ok" }, { headers: NO_CACHE });
  } catch (err) {
    console.error("DELETE /api/admin/data/tags/[id] failed:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500, headers: NO_CACHE });
  }
}
