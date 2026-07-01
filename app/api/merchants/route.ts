import { sql } from "@/lib/db";
import { areValidIds, isValidId } from "@/lib/validate";
import { NextRequest, NextResponse } from "next/server";



export async function GET(req: NextRequest) {
  const qRaw     = req.nextUrl.searchParams.get("q")?.toLowerCase().slice(0, 80) ?? "";
  // Escapar comodines de LIKE: que buscar "100%" o "_" no actúe como patrón
  const q        = qRaw.replace(/[\\%_]/g, "\\$&");
  const category = req.nextUrl.searchParams.get("category");
  // Filtro por tags: lista separada por comas. Un comercio matchea si tiene
  // CUALQUIERA de los tags pedidos (semántica OR / ANY-of).
  const tagsParam = req.nextUrl.searchParams.get("tags");
  const tagIds    = tagsParam ? tagsParam.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 30) : [];

  if (category !== null && !isValidId(category)) {
    return NextResponse.json({ error: "category inválida" }, { status: 400 });
  }
  if (tagIds.length && !areValidIds(tagIds)) {
    return NextResponse.json({ error: "tags inválidos" }, { status: 400 });
  }

  try {
    const merchants = await sql`
      SELECT
        m.id,
        m.name,
        m.category_id,
        m.aliases,
        m.popularity_prior,
        mc.label AS category_label,
        mc.emoji,
        (
          SELECT COALESCE(MAX(COALESCE(p.discount, p.discount_per_unit, 0)), 0)
          FROM promotions p
          WHERE p.merchant_id = m.id AND p.active = true
        )::int AS max_discount,
        COALESCE((
          SELECT json_agg(json_build_object('id', mt.id, 'label', mt.label, 'emoji', mt.emoji) ORDER BY mt.label)
          FROM merchant_tag_map mtm
          JOIN merchant_tags mt ON mt.id = mtm.tag_id
          WHERE mtm.merchant_id = m.id
        ), '[]'::json) AS tags
      FROM merchants m
      JOIN merchant_categories mc ON m.category_id = mc.id
      WHERE
        (
          ${q} = ''
          OR lower(m.name) LIKE ${"%" + q + "%"}
          OR EXISTS (
            SELECT 1 FROM unnest(m.aliases) AS alias
            WHERE lower(alias) LIKE ${"%" + q + "%"}
          )
        )
        AND (
          ${category ?? ""} = ''
          OR m.category_id = ${category ?? ""}
        )
        AND (
          cardinality(${tagIds}::text[]) = 0
          OR EXISTS (
            SELECT 1 FROM merchant_tag_map mtm
            WHERE mtm.merchant_id = m.id AND mtm.tag_id = ANY(${tagIds}::text[])
          )
        )
      ORDER BY m.name
      LIMIT 50
    `;

    return NextResponse.json(merchants, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
    });
  } catch (err) {
    console.error("GET /api/merchants failed:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
