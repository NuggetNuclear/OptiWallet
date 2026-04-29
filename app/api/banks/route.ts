import { sql } from "@/lib/db";
import { NextResponse } from "next/server";



export async function GET() {
  const banks = await sql`
    SELECT * FROM banks ORDER BY available DESC, name ASC
  `;
  return NextResponse.json(banks);
}
