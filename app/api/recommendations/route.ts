import { sql } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";



export async function GET(req: NextRequest) {
  const cardIds    = req.nextUrl.searchParams.getAll("cardIds");
  const dateStr    = req.nextUrl.searchParams.get("date")
                     ?? new Date().toISOString().split("T")[0];
  const merchantId = req.nextUrl.searchParams.get("merchantId");

  if (!cardIds.length) return NextResponse.json([]);

  const dayOfWeek = new Date(dateStr + "T12:00:00Z").getDay();

  const rows = await sql`
    SELECT
      p.id             AS promotion_id,
      p.discount,
      p.cap,
      p.days_of_week,
      p.start_date,
      p.end_date,
      p.modality,
      p.code,
      p.conditions,
      p.source,
      p.verified_at,
      m.id             AS merchant_id,
      m.name           AS merchant_name,
      m.category_id,
      mc.label         AS category_label,
      mc.emoji,
      c.id             AS card_id,
      c.name           AS card_name,
      c.type           AS card_type,
      c.bank_id
    FROM promotions p
    JOIN merchants m
      ON p.merchant_id = m.id
    JOIN merchant_categories mc
      ON m.category_id = mc.id
    JOIN cards c
      ON c.bank_id = p.bank_id
     AND c.type    = ANY(p.card_types)
     AND c.id      = ANY(${cardIds})
    WHERE p.active = true
      AND (
            cardinality(p.days_of_week) = 0
            OR ${dayOfWeek} = ANY(p.days_of_week)
          )
      AND (p.start_date IS NULL OR p.start_date <= ${dateStr}::date)
      AND (p.end_date   IS NULL OR p.end_date   >= ${dateStr}::date)
      AND (
            ${merchantId ?? ""} = ''
            OR p.merchant_id = ${merchantId ?? ""}
          )
    ORDER BY p.discount DESC
  `;

  return NextResponse.json(rows);
}
