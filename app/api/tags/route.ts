import { sql } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const tags = await sql`
      SELECT
        mt.id,
        mt.label,
        mt.emoji,
        count(mtm.merchant_id)::int AS merchant_count
      FROM merchant_tags mt
      LEFT JOIN merchant_tag_map mtm ON mtm.tag_id = mt.id
      GROUP BY mt.id, mt.label, mt.emoji
      ORDER BY mt.label
    `;
    return NextResponse.json(tags, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" },
    });
  } catch (err) {
    console.error("GET /api/tags failed:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
