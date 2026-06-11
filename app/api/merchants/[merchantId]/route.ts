import { sql } from "@/lib/db";
import { isValidId } from "@/lib/validate";
import { NextRequest, NextResponse } from "next/server";



export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ merchantId: string }> }
) {
  const { merchantId } = await params;

  if (!isValidId(merchantId)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  try {
    const rows = await sql`
      SELECT
        m.id,
        m.name,
        m.category_id,
        m.aliases,
        mc.label AS category_label,
        mc.emoji
      FROM merchants m
      JOIN merchant_categories mc ON m.category_id = mc.id
      WHERE m.id = ${merchantId}
      LIMIT 1
    `;

    if (rows.length === 0) {
      return NextResponse.json(null, { status: 404 });
    }

    return NextResponse.json(rows[0], {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
    });
  } catch (err) {
    console.error("GET /api/merchants/[merchantId] failed:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
