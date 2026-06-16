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
      SELECT mc.id, mc.label, mc.emoji, COUNT(m.id)::int AS merchant_count
      FROM merchant_categories mc
      LEFT JOIN merchants m ON m.category_id = mc.id
      GROUP BY mc.id, mc.label, mc.emoji
      ORDER BY mc.label
    `;
    return NextResponse.json(rows, { headers: NO_CACHE });
  } catch (err) {
    console.error("GET /api/admin/data/categories failed:", err);
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
    if (!emoji || typeof emoji !== "string") return NextResponse.json({ error: "emoji requerido" }, { status: 400, headers: NO_CACHE });

    await sql`INSERT INTO merchant_categories (id, label, emoji) VALUES (${id}, ${label}, ${emoji})`;
    await logAdminAction(session, "create", "category", id, `Categoría "${label}" creada`, clientIp(req));
    return NextResponse.json({ id }, { status: 201, headers: NO_CACHE });
  } catch (err) {
    console.error("POST /api/admin/data/categories failed:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500, headers: NO_CACHE });
  }
}
