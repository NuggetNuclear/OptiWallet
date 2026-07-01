import { sql } from "@/lib/db";
import { requireAdmin, clientIp } from "@/lib/admin-guard";
import { logAdminAction } from "@/lib/admin-log";
import { isValidId } from "@/lib/validate";
import { MERCHANT_NAME_MAX_LENGTH } from "@/lib/staging";
import { NextRequest, NextResponse } from "next/server";

const NO_CACHE = { "Cache-Control": "no-store" };

export async function GET(req: NextRequest) {
  if (!await requireAdmin(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401, headers: NO_CACHE });
  }
  try {
    const category = req.nextUrl.searchParams.get("category");
    if (category && !isValidId(category)) {
      return NextResponse.json({ error: "category inválida" }, { status: 400, headers: NO_CACHE });
    }
    const rows = await sql`
      SELECT m.id, m.name, m.category_id, m.aliases, mc.label AS category_label, mc.emoji,
        COALESCE((
          SELECT json_agg(json_build_object('id', mt.id, 'label', mt.label, 'emoji', mt.emoji) ORDER BY mt.label)
          FROM merchant_tag_map mtm
          JOIN merchant_tags mt ON mt.id = mtm.tag_id
          WHERE mtm.merchant_id = m.id
        ), '[]'::json) AS tags
      FROM merchants m
      JOIN merchant_categories mc ON m.category_id = mc.id
      WHERE (${category ?? ""} = '' OR m.category_id = ${category ?? ""})
      ORDER BY m.name
    `;
    return NextResponse.json(rows, { headers: NO_CACHE });
  } catch (err) {
    console.error("GET /api/admin/data/merchants failed:", err);
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
    const { id, name, category_id, aliases, tag_ids } = body ?? {};

    if (!id || !isValidId(id)) return NextResponse.json({ error: "ID inválido" }, { status: 400, headers: NO_CACHE });
    if (!name || typeof name !== "string" || !name.trim()) return NextResponse.json({ error: "name requerido" }, { status: 400, headers: NO_CACHE });
    if (name.trim().length > MERCHANT_NAME_MAX_LENGTH) return NextResponse.json({ error: `El nombre del comercio no puede superar ${MERCHANT_NAME_MAX_LENGTH} caracteres` }, { status: 400, headers: NO_CACHE });
    if (!category_id || !isValidId(category_id)) return NextResponse.json({ error: "category_id inválido" }, { status: 400, headers: NO_CACHE });
    if (tag_ids !== undefined && (!Array.isArray(tag_ids) || !tag_ids.every((t: unknown) => typeof t === "string" && isValidId(t))))
      return NextResponse.json({ error: "tag_ids inválido" }, { status: 400, headers: NO_CACHE });

    const aliasArray = Array.isArray(aliases) ? aliases.filter((a: unknown) => typeof a === "string") : [];
    const tagArray: string[] = Array.isArray(tag_ids) ? Array.from(new Set(tag_ids as string[])) : [];

    await sql`
      INSERT INTO merchants (id, name, category_id, aliases)
      VALUES (${id}, ${name}, ${category_id}, ${aliasArray})
    `;
    for (const t of tagArray) {
      await sql`INSERT INTO merchant_tag_map (merchant_id, tag_id) VALUES (${id}, ${t}) ON CONFLICT DO NOTHING`;
    }
    await logAdminAction(session, "create", "merchant", id, `Comercio "${name}" creado en categoría ${category_id}`, clientIp(req));
    return NextResponse.json({ id }, { status: 201, headers: NO_CACHE });
  } catch (err) {
    console.error("POST /api/admin/data/merchants failed:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500, headers: NO_CACHE });
  }
}
