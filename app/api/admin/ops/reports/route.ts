import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-guard";
import { NextRequest, NextResponse } from "next/server";

const NO_CACHE = { "Cache-Control": "no-store" };
const VALID_STATUS = new Set(["pending", "resolved", "dismissed"]);

// GET /api/admin/ops/reports?status=pending
// Reportes de usuarios AGRUPADOS por promoción, con conteos y desglose de motivos.
export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401, headers: NO_CACHE });
  }
  const statusParam = req.nextUrl.searchParams.get("status") ?? "pending";
  const status = VALID_STATUS.has(statusParam) ? statusParam : "pending";

  try {
    const rows = await sql`
      SELECT
        pr.promotion_id,
        pr.merchant_id,
        pr.bank_id,
        m.name  AS merchant_name,
        b.name  AS bank_name,
        p.discount,
        p.discount_per_unit,
        p.end_date,
        p.active,
        COUNT(*)::int                                             AS report_count,
        COUNT(*) FILTER (WHERE pr.reason = 'expired')::int        AS r_expired,
        COUNT(*) FILTER (WHERE pr.reason = 'wrong_discount')::int AS r_wrong_discount,
        COUNT(*) FILTER (WHERE pr.reason = 'not_found')::int      AS r_not_found,
        COUNT(*) FILTER (WHERE pr.reason = 'other')::int          AS r_other,
        COUNT(*) FILTER (WHERE pr.reason IS NULL)::int            AS r_unspecified,
        MAX(pr.created_at)                                        AS last_at,
        COALESCE(array_agg(pr.note) FILTER (WHERE pr.note IS NOT NULL), '{}') AS notes
      FROM promo_reports pr
      JOIN promotions p  ON p.id = pr.promotion_id
      LEFT JOIN merchants m ON m.id = pr.merchant_id
      LEFT JOIN banks b     ON b.id = pr.bank_id
      WHERE pr.status = ${status}
      GROUP BY pr.promotion_id, pr.merchant_id, pr.bank_id, m.name, b.name,
               p.discount, p.discount_per_unit, p.end_date, p.active
      ORDER BY report_count DESC, last_at DESC
    `;
    return NextResponse.json(rows, { headers: NO_CACHE });
  } catch (err) {
    console.error("GET /api/admin/ops/reports failed:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500, headers: NO_CACHE });
  }
}
