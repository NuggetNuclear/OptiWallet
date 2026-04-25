import { sql } from "@/lib/db";
import { NextResponse } from "next/server";

export const runtime = "edge";

export async function GET() {
  const rows = await sql`
    SELECT
      (SELECT count(*) FROM promotions WHERE active = true) AS promotions,
      (SELECT count(*) FROM merchants)                      AS merchants,
      (SELECT count(*) FROM banks)                          AS banks
  `;
  return NextResponse.json(rows[0]);
}
