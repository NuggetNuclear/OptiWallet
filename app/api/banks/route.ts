import { sql } from "@/lib/db";
import { NextResponse } from "next/server";



export async function GET() {
  try {
    const banks = await sql`
      SELECT * FROM banks ORDER BY available DESC, name ASC
    `;
    return NextResponse.json(banks, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
    });
  } catch (err) {
    console.error("GET /api/banks failed:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
