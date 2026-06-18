import { sql } from "@/lib/db";
import { isValidId } from "@/lib/validate";
import { NextRequest, NextResponse } from "next/server";



export async function GET(req: NextRequest) {
  const qRaw     = req.nextUrl.searchParams.get("q")?.toLowerCase().slice(0, 80) ?? "";
  // Escapar comodines de LIKE: que buscar "100%" o "_" no actúe como patrón
  const q        = qRaw.replace(/[\\%_]/g, "\\$&");
  const category = req.nextUrl.searchParams.get("category");

  if (category !== null && !isValidId(category)) {
    return NextResponse.json({ error: "category inválida" }, { status: 400 });
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
        mc.emoji
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
