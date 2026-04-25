import { sql } from "@/lib/db";
import { NextResponse } from "next/server";

export const runtime = "edge";

export async function GET() {
  const categories = await sql`
    SELECT id, label, emoji
    FROM merchant_categories
    ORDER BY label
  `;
  return NextResponse.json(categories);
}
