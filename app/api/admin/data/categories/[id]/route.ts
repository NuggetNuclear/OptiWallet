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
    const rows = await sql`SELECT id, label, emoji FROM merchant_categories WHERE id = ${id}`;
    if (!rows.length) return NextResponse.json(null, { status: 404, headers: NO_CACHE });
    return NextResponse.json(rows[0], { headers: NO_CACHE });
  } catch (err) {
    console.error("GET /api/admin/data/categories/[id] failed:", err);
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
    if (has("emoji") && (typeof fields.emoji !== "string" || !fields.emoji.trim()))
      return NextResponse.json({ error: "emoji inválido" }, { status: 400, headers: NO_CACHE });

    const rows = await sql`SELECT id, label, emoji FROM merchant_categories WHERE id = ${id}`;
    if (!rows.length) return NextResponse.json(null, { status: 404, headers: NO_CACHE });

    const cur = rows[0] as Record<string, unknown>;
    const newId    = has("new_id") ? String(fields.new_id).trim() : id;
    const cascade  = fields.cascade !== false; // default true
    const next = {
      label: has("label") ? String(fields.label).trim() : cur.label as string,
      emoji: has("emoji") ? String(fields.emoji).trim() : cur.emoji as string,
    };

    const renamingId = newId !== id;
    if (renamingId && !isValidId(newId))
      return NextResponse.json({ error: "new_id inválido (slug)" }, { status: 400, headers: NO_CACHE });
    if (renamingId) {
      const exists = await sql`SELECT id FROM merchant_categories WHERE id = ${newId}`;
      if (exists.length) return NextResponse.json({ error: `Ya existe una categoría con id '${newId}'` }, { status: 409, headers: NO_CACHE });
    }

    if (renamingId) {
      // La FK merchants.category_id es ON UPDATE RESTRICT, así que no podemos hacer
      // UPDATE en cascada directamente. Usamos INSERT → reasignación → DELETE.
      await sql`INSERT INTO merchant_categories (id, label, emoji) VALUES (${newId}, ${next.label}, ${next.emoji})`;
      if (cascade) {
        await sql`UPDATE merchants SET category_id = ${newId} WHERE category_id = ${id}`;
      }
      await sql`DELETE FROM merchant_categories WHERE id = ${id}`;
      const affectedRows = cascade ? await sql`SELECT COUNT(*)::int AS n FROM merchants WHERE category_id = ${newId}` : [];
      const n = (affectedRows[0] as { n: number } | undefined)?.n ?? 0;
      await logAdminAction(session, "update", "category", newId,
        `Renombrado de '${id}' → '${newId}'${cascade ? ` (cascade: ${n} comercios actualizados)` : " (sin cascade)"}`, clientIp(req));
      return NextResponse.json({ status: "ok", new_id: newId, cascade, merchants_updated: cascade ? n : 0 }, { headers: NO_CACHE });
    }

    // Sin cambio de ID: UPDATE simple
    const changed = ["label", "emoji"].filter(has);
    if (!changed.length) return NextResponse.json({ status: "ok" }, { headers: NO_CACHE });
    await sql`UPDATE merchant_categories SET label = ${next.label}, emoji = ${next.emoji} WHERE id = ${id}`;
    await logAdminAction(session, "update", "category", id, `Campos: ${changed.join(", ")}`, clientIp(req));
    return NextResponse.json({ status: "ok" }, { headers: NO_CACHE });
  } catch (err) {
    console.error("PATCH /api/admin/data/categories/[id] failed:", err);
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
      const merchants = await sql`SELECT id, name FROM merchants WHERE category_id = ${id}`;
      if (merchants.length) {
        return NextResponse.json(
          { error: "Tiene dependencias", merchants },
          { status: 409, headers: NO_CACHE },
        );
      }
    }
    const labelRow = await sql`SELECT label FROM merchant_categories WHERE id = ${id}`;
    await sql`DELETE FROM merchant_categories WHERE id = ${id}`;
    await logAdminAction(session, "delete", "category", id, `Categoría "${labelRow[0]?.label ?? id}" eliminada`, clientIp(req));
    return NextResponse.json({ status: "ok" }, { headers: NO_CACHE });
  } catch (err) {
    console.error("DELETE /api/admin/data/categories/[id] failed:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500, headers: NO_CACHE });
  }
}
