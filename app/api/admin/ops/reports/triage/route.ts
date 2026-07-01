import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-guard";
import { aiAvailable } from "@/lib/ai/provider";
import { triageReports, type TriageItem } from "@/lib/ai/report-triage";
import { toISODateLocal } from "@/lib/format";
import { NextRequest, NextResponse } from "next/server";

const NO_CACHE = { "Cache-Control": "no-store" };

interface GroupRow {
  promotion_id: string;
  merchant_name: string | null;
  discount: number | null;
  end_date: string | null;
  report_count: number;
  r_expired: number;
  r_wrong_discount: number;
  r_not_found: number;
  r_other: number;
  r_unspecified: number;
  notes: string[];
}

// POST /api/admin/ops/reports/triage
// Prioriza con IA la cola de reportes PENDIENTES. 503 si no hay IA configurada
// (mismo contrato que autofill) — el panel cae al orden heurístico.
export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401, headers: NO_CACHE });
  }
  if (!aiAvailable()) {
    return NextResponse.json({ error: "IA no configurada" }, { status: 503, headers: NO_CACHE });
  }
  try {
    const rows = await sql`
      SELECT
        pr.promotion_id,
        m.name AS merchant_name,
        p.discount,
        p.end_date,
        COUNT(*)::int                                             AS report_count,
        COUNT(*) FILTER (WHERE pr.reason = 'expired')::int        AS r_expired,
        COUNT(*) FILTER (WHERE pr.reason = 'wrong_discount')::int AS r_wrong_discount,
        COUNT(*) FILTER (WHERE pr.reason = 'not_found')::int      AS r_not_found,
        COUNT(*) FILTER (WHERE pr.reason = 'other')::int          AS r_other,
        COUNT(*) FILTER (WHERE pr.reason IS NULL)::int            AS r_unspecified,
        COALESCE(array_agg(pr.note) FILTER (WHERE pr.note IS NOT NULL), '{}') AS notes
      FROM promo_reports pr
      JOIN promotions p  ON p.id = pr.promotion_id
      LEFT JOIN merchants m ON m.id = pr.merchant_id
      WHERE pr.status = 'pending'
      GROUP BY pr.promotion_id, m.name, p.discount, p.end_date
      ORDER BY report_count DESC
    ` as GroupRow[];

    const today = toISODateLocal(new Date());
    const items: TriageItem[] = rows.map((g) => ({
      promotion_id: g.promotion_id,
      merchant: g.merchant_name ?? g.promotion_id,
      discount: g.discount,
      end_date: g.end_date ? String(g.end_date).slice(0, 10) : null,
      today,
      count: g.report_count,
      reasons: {
        expired: g.r_expired,
        wrong_discount: g.r_wrong_discount,
        not_found: g.r_not_found,
        other: g.r_other,
        unspecified: g.r_unspecified,
      },
      notes: Array.isArray(g.notes) ? g.notes : [],
    }));

    const triage = await triageReports(items);
    return NextResponse.json({ triage }, { headers: NO_CACHE });
  } catch (err) {
    console.error("POST /api/admin/ops/reports/triage failed:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500, headers: NO_CACHE });
  }
}
