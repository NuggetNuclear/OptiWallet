import { sql } from "@/lib/db";
import { requireAdmin, clientIp } from "@/lib/admin-guard";
import { logAdminAction } from "@/lib/admin-log";
import { isValidId } from "@/lib/validate";
import { NextRequest, NextResponse } from "next/server";

const NO_CACHE = { "Cache-Control": "no-store" };

export async function GET(req: NextRequest) {
  if (!await requireAdmin(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401, headers: NO_CACHE });
  }
  try {
    const rows = await sql`
      SELECT mt.id, mt.label, mt.emoji, COUNT(mtm.merchant_id)::int AS merchant_count
      FROM merchant_tags mt
      LEFT JOIN merchant_tag_map mtm ON mtm.tag_id = mt.id
      GROUP BY mt.id, mt.label, mt.emoji
      ORDER BY mt.label
    `;
    return NextResponse.json(rows, { headers: NO_CACHE });
  } catch (err) {
    console.error("GET /api/admin/data/tags failed:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500, headers: NO_CACHE });
  }
}

export async function POST(req: NextRequest) {
  const session = await requireAdmin(req);
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401, headers: NO_CACHE });
  }
  try {
    const body = await req.json().catch(() => null);
    const { id, label, emoji } = body ?? {};

    if (!id || !isValidId(id)) return NextResponse.json({ error: "ID inválido" }, { status: 400, headers: NO_CACHE });
    if (!label || typeof label !== "string") return NextResponse.json({ error: "label requerido" }, { status: 400, headers: NO_CACHE });
    // emoji es opcional en tags
    if (emoji != null && typeof emoji !== "string") return NextResponse.json({ error: "emoji inválido" }, { status: 400, headers: NO_CACHE });

    await sql`INSERT INTO merchant_tags (id, label, emoji) VALUES (${id}, ${label}, ${emoji || null})`;
    await logAdminAction(session, "create", "tag", id, `Tag "${label}" creado`, clientIp(req));
    return NextResponse.json({ id }, { status: 201, headers: NO_CACHE });
  } catch (err) {
    console.error("POST /api/admin/data/tags failed:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500, headers: NO_CACHE });
  }
}
