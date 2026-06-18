import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-guard";
import { isValidId } from "@/lib/validate";
import { NextRequest, NextResponse } from "next/server";

const NO_CACHE = { "Cache-Control": "no-store" };
const STATUSES = ["pending", "approved", "rejected"];

/**
 * GET /api/admin/ops/[bankId]/staging?status=pending
 * Lista las filas en staging de un banco para la cola de revisión.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ bankId: string }> }) {
  if (!(await requireAdmin(req))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401, headers: NO_CACHE });
  }
  try {
    const { bankId } = await params;
    if (!isValidId(bankId)) {
      return NextResponse.json({ error: "bankId inválido" }, { status: 400, headers: NO_CACHE });
    }
    const status = req.nextUrl.searchParams.get("status") ?? "pending";
    if (!STATUSES.includes(status)) {
      return NextResponse.json({ error: "status inválido" }, { status: 400, headers: NO_CACHE });
    }

    const rows = await sql`
      SELECT
        id, run_id, bank_id, status, merchant_name, merchant_id,
        discount, discount_per_unit, discount_unit, cap, min_purchase,
        days_of_week, card_types, card_ids, source_cards, modality,
        start_date, end_date, stackable, code, conditions, source,
        warnings, fingerprint, created_promo_id, created_at, reviewed_at, reviewed_by
      FROM promo_staging
      WHERE bank_id = ${bankId} AND status = ${status}
      ORDER BY (array_length(warnings, 1) > 0) DESC, COALESCE(discount, 0) DESC, merchant_name
    `;
    return NextResponse.json(rows, { headers: NO_CACHE });
  } catch (err) {
    console.error("GET /api/admin/ops/[bankId]/staging failed:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500, headers: NO_CACHE });
  }
}
