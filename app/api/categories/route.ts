import { sql } from "@/lib/db";
import { NextResponse } from "next/server";



export async function GET() {
  try {
    const categories = await sql`
      SELECT
        mc.id,
        mc.label,
        mc.emoji,
        count(m.id)::int AS merchant_count
      FROM merchant_categories mc
      LEFT JOIN merchants m ON m.category_id = mc.id
      GROUP BY mc.id, mc.label, mc.emoji
      ORDER BY mc.label
    `;
    return NextResponse.json(categories, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" },
    });
  } catch (err) {
    console.error("GET /api/categories failed:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
