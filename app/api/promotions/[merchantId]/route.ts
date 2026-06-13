import { sql } from "@/lib/db";
import { isValidId } from "@/lib/validate";
import { NextRequest, NextResponse } from "next/server";



export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ merchantId: string }> }
) {
  const { merchantId } = await params;

  // "Hoy" en hora de Chile (no en el UTC del server gru1), coherente con
  // /api/recommendations: evita esconder promos que vencen hoy unas horas antes.
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());

  if (!isValidId(merchantId)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  try {
    // Columnas explícitas (las que describe ApiPromotion) — sin created_at /
    // updated_at ni campos internos futuros.
    const promos = await sql`
      SELECT
        p.id,
        p.bank_id,
        p.card_types,
        p.merchant_id,
        p.discount,
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
        p.active,
        b.name AS bank_name
      FROM promotions p
      JOIN banks b ON p.bank_id = b.id
      WHERE p.merchant_id = ${merchantId}
        AND p.active = true
        AND (p.end_date IS NULL OR p.end_date >= ${today}::date)
      ORDER BY p.discount DESC
    `;

    return NextResponse.json(promos, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
    });
  } catch (err) {
    console.error("GET /api/promotions/[merchantId] failed:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
