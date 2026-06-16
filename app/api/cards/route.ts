import { sql } from "@/lib/db";
import { isValidId } from "@/lib/validate";
import { NextRequest, NextResponse } from "next/server";



export async function GET(req: NextRequest) {
  const bankId = req.nextUrl.searchParams.get("bankId");

  if (bankId !== null && !isValidId(bankId)) {
    return NextResponse.json({ error: "bankId inválido" }, { status: 400 });
  }

  try {
    const cards = await sql`
      SELECT id, bank_id, name, type
      FROM cards
      WHERE (${bankId ?? ""} = '' OR bank_id = ${bankId ?? ""})
      ORDER BY bank_id, type, name
    `;

    return NextResponse.json(cards, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" },
    });
  } catch (err) {
    console.error("GET /api/cards failed:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
