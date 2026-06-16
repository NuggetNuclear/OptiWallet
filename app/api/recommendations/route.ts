import { sql } from "@/lib/db";
import { areValidIds, isValidId } from "@/lib/validate";
import { NextRequest, NextResponse } from "next/server";



export async function GET(req: NextRequest) {
  const cardIds    = req.nextUrl.searchParams.getAll("cardIds");
  // Fecha por defecto: hoy en Chile, no en el UTC del servidor
  const dateStr    = req.nextUrl.searchParams.get("date")
                     ?? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" })
                          .format(new Date());
  const merchantId = req.nextUrl.searchParams.get("merchantId");

  if (!cardIds.length) return NextResponse.json([]);
  if (cardIds.length > 100) {
    return NextResponse.json({ error: "Demasiadas tarjetas" }, { status: 400 });
  }
  // Defensa en profundidad: las queries van parametrizadas, pero un ID
  // malformado no tiene por qué llegar a la base.
  if (!areValidIds(cardIds)) {
    return NextResponse.json({ error: "cardIds inválidos" }, { status: 400 });
  }
  if (merchantId !== null && !isValidId(merchantId)) {
    return NextResponse.json({ error: "merchantId inválido" }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return NextResponse.json({ error: "Fecha inválida (YYYY-MM-DD)" }, { status: 400 });
  }
  // Catch logically invalid dates that pass the regex (e.g. "9999-99-99")
  if (isNaN(new Date(dateStr + "T00:00:00Z").getTime())) {
    return NextResponse.json({ error: "Fecha inválida" }, { status: 400 });
  }

  // getUTCDay sobre medianoche UTC: día calendario exacto de dateStr,
  // independiente de la zona horaria del servidor
  const dayOfWeek = new Date(dateStr + "T00:00:00Z").getUTCDay();

  try {
    const rows = await sql`
      SELECT
        p.id             AS promotion_id,
        p.discount,
        p.discount_per_unit,
        p.discount_unit,
        p.stackable,
        p.cap,
        p.min_purchase,
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
       AND c.id      = ANY(${cardIds})
       AND (
             -- "Tarjeta única": si la promo está restringida a card_ids específicos,
             -- aplica SOLO a esas tarjetas (ignora card_types).
             (cardinality(p.card_ids) > 0 AND c.id = ANY(p.card_ids))
             -- Histórico: sin restricción, aplica por tipo de tarjeta del banco.
             OR (cardinality(p.card_ids) = 0 AND c.type = ANY(p.card_types))
           )
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
      ORDER BY COALESCE(p.discount, 0) DESC, COALESCE(p.discount_per_unit, 0) DESC
    `;

    return NextResponse.json(rows, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
    });
  } catch (err) {
    console.error("GET /api/recommendations failed:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
