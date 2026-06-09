import { sql } from "@/lib/db";
import { NextResponse } from "next/server";



export async function GET() {
  try {
    const rows = await sql`
      SELECT
        (SELECT count(*) FROM promotions WHERE active = true) AS promotions,
        (SELECT count(*) FROM merchants)                      AS merchants,
        (SELECT count(*) FROM banks)                          AS banks
    `;
    return NextResponse.json(rows[0], {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
    });
  } catch (err) {
    console.error("GET /api/stats failed:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
