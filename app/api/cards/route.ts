import { sql } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";



export async function GET(req: NextRequest) {
  const bankId = req.nextUrl.searchParams.get("bankId");

  const cards = await sql`
    SELECT id, bank_id, name, type
    FROM cards
    WHERE (${bankId ?? ""} = '' OR bank_id = ${bankId ?? ""})
    ORDER BY bank_id, type, name
  `;

  return NextResponse.json(cards);
}
