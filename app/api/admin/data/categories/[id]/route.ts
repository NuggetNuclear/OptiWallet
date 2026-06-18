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

    if (has("label") && (typeof fields.label !== "string" || !fields.label.trim())) return NextResponse.json({ error: "label inválido" }, { status: 400, headers: NO_CACHE });
    if (has("emoji") && (typeof fields.emoji !== "string" || !fields.emoji.trim())) return NextResponse.json({ error: "emoji inválido" }, { status: 400, headers: NO_CACHE });

    const changed = ["label", "emoji"].filter(has);
    const rows = await sql`SELECT id, label, emoji FROM merchant_categories WHERE id = ${id}`;
    if (!rows.length) return NextResponse.json(null, { status: 404, headers: NO_CACHE });
    if (!changed.length) return NextResponse.json({ status: "ok" }, { headers: NO_CACHE });

    const cur = rows[0] as Record<string, unknown>;
    const next = {
      label: has("label") ? fields.label : cur.label,
      emoji: has("emoji") ? fields.emoji : cur.emoji,
    };

    // Single atomic UPDATE — no partial-write window.
    await sql`
      UPDATE merchant_categories SET
        label = ${next.label as string},
        emoji = ${next.emoji as string}
      WHERE id = ${id}
    `;

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
