import { sql } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ merchantId: string }> }
) {
  const { merchantId } = await params;

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

  return NextResponse.json(promos);
}
