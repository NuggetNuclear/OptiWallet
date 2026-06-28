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
        COALESCE(pc.code, p.code) AS code,
        p.conditions,
        p.source,
        p.verified_at,
        m.id             AS merchant_id,
        m.name           AS merchant_name,
        m.popularity_prior,
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
      LEFT JOIN promotion_codes pc
        ON pc.promotion_id = p.id
       AND pc.start_date <= ${dateStr}::date
       AND pc.end_date   >= ${dateStr}::date
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
        AND (
              -- If it has entries in promotion_codes, it must have an active code for this date
              NOT EXISTS (SELECT 1 FROM promotion_codes WHERE promotion_id = p.id)
              OR pc.code IS NOT NULL
            )
      ORDER BY (
        -- ── Score compuesto de ranking (ARCHITECTURE.md § Flujo de recomendaciones) ──
        --
        -- Cuatro señales ponderadas, cada una normalizada a [0, 1]:
        --   50%  descuento  — señal principal de calidad de oferta
        --   20%  popularidad — prior frío desde Google Places (merchants.popularity_prior)
        --   20%  frescura   — qué tan reciente es la verificación (verified_at)
        --   10%  urgencia   — promos con vencimiento próximo suben (incentivo al uso)
        --
        -- Descuento: usamos el mayor entre discount y discount_per_unit, normalizado
        -- a 100 como máximo razonable (un 20% sobre base 100 vale 0.20).
        0.50 * LEAST(COALESCE(p.discount, p.discount_per_unit, 0) / 100.0, 1.0)

        -- Popularidad: cold-start bayesiano — si no hay prior (NULL) usamos 0.5 neutro.
        + 0.20 * COALESCE(m.popularity_prior, 0.5)

        -- Frescura: exp-decay sobre días desde verified_at (vida media = 90 días).
        -- Sin verified_at → frescura mínima (0).
        + 0.20 * CASE
            WHEN p.verified_at IS NOT NULL
            THEN EXP(-0.693 * EXTRACT(EPOCH FROM (NOW() - p.verified_at)) / 7776000.0)
            ELSE 0.0
          END

        -- Urgencia: promos que vencen en ≤ 7 días suben; sin end_date = sin urgencia.
        + 0.10 * CASE
            WHEN p.end_date IS NOT NULL
              AND p.end_date >= ${dateStr}::date
              AND p.end_date <= (${dateStr}::date + INTERVAL '7 days')
            THEN 1.0
            ELSE 0.0
          END
      ) DESC
    `;

    return NextResponse.json(rows, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
    });
  } catch (err) {
    console.error("GET /api/recommendations failed:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
