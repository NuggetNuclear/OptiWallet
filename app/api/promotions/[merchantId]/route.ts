import { sql } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";



export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ merchantId: string }> }
) {
  const { merchantId } = await params;

  try {
    const promos = await sql`
      SELECT
        p.*,
        b.name AS bank_name
      FROM promotions p
      JOIN banks b ON p.bank_id = b.id
      WHERE p.merchant_id = ${merchantId}
        AND p.active = true
      ORDER BY p.discount DESC
    `;

    return NextResponse.json(promos, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
    });
  } catch (err) {
    console.error("GET /api/promotions/[merchantId] failed:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
