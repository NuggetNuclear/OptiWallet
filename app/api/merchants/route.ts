import { sql } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  const q        = req.nextUrl.searchParams.get("q")?.toLowerCase() ?? "";
  const category = req.nextUrl.searchParams.get("category");

  const merchants = await sql`
    SELECT
      m.id,
      m.name,
      m.category_id,
      m.aliases,
      mc.label AS category_label,
      mc.emoji
    FROM merchants m
    JOIN merchant_categories mc ON m.category_id = mc.id
    WHERE
      (
        ${q} = ''
        OR lower(m.name) LIKE ${"%" + q + "%"}
        OR EXISTS (
          SELECT 1 FROM unnest(m.aliases) AS alias
          WHERE lower(alias) LIKE ${"%" + q + "%"}
        )
      )
      AND (
        ${category ?? ""} = ''
        OR m.category_id = ${category ?? ""}
      )
    ORDER BY m.name
    LIMIT 50
  `;

  return NextResponse.json(merchants);
}
