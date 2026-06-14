import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-guard";
import { isValidId } from "@/lib/validate";
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
      SELECT m.id, m.name, m.category_id, m.aliases, mc.label AS category_label, mc.emoji
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
  if (!await requireAdmin(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401, headers: NO_CACHE });
  }
  try {
    const body = await req.json().catch(() => null);
    const { id, name, category_id, aliases } = body ?? {};

    if (!id || !isValidId(id)) return NextResponse.json({ error: "ID inválido" }, { status: 400, headers: NO_CACHE });
    if (!name || typeof name !== "string") return NextResponse.json({ error: "name requerido" }, { status: 400, headers: NO_CACHE });
    if (!category_id || !isValidId(category_id)) return NextResponse.json({ error: "category_id inválido" }, { status: 400, headers: NO_CACHE });

    const aliasArray = Array.isArray(aliases) ? aliases.filter((a: unknown) => typeof a === "string") : [];

    await sql`
      INSERT INTO merchants (id, name, category_id, aliases)
      VALUES (${id}, ${name}, ${category_id}, ${aliasArray})
    `;
    return NextResponse.json({ id }, { status: 201, headers: NO_CACHE });
  } catch (err) {
    console.error("POST /api/admin/data/merchants failed:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500, headers: NO_CACHE });
  }
}
