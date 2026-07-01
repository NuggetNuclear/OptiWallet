import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-guard";
import { NextRequest, NextResponse } from "next/server";

const NO_CACHE = { "Cache-Control": "no-store" };

/**
 * GET /api/admin/ops/overview
 *
 * Datos de la central de operaciones: por cada banco, cuántas promos esperan
 * revisión (staging pending), cuántas hay en producción (promotions activas),
 * y el último fetch importado. Más totales para el backlog global.
 */
export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401, headers: NO_CACHE });
  }
  try {
    const rows = await sql`
      SELECT
        b.id,
        b.name,
        b.available,
        COALESCE(s.pending, 0)        AS pending,
        COALESCE(s.rejected, 0)       AS rejected,
        COALESCE(p.active_promos, 0)  AS active_promos,
        r.last_fetch,
        r.last_imported,
        r.last_total,
        r.last_edges
      FROM banks b
      LEFT JOIN (
        SELECT bank_id,
               COUNT(*) FILTER (WHERE status = 'pending')::int  AS pending,
               COUNT(*) FILTER (WHERE status = 'rejected')::int AS rejected
        FROM promo_staging GROUP BY bank_id
      ) s ON s.bank_id = b.id
      LEFT JOIN (
        SELECT bank_id, COUNT(*)::int AS active_promos
        FROM promotions WHERE active = true GROUP BY bank_id
      ) p ON p.bank_id = b.id
      LEFT JOIN LATERAL (
        SELECT created_at AS last_fetch, imported AS last_imported,
               total AS last_total, edge_count AS last_edges
        FROM scraper_runs WHERE bank_id = b.id
        ORDER BY created_at DESC LIMIT 1
      ) r ON true
      ORDER BY (COALESCE(s.pending, 0) > 0) DESC, b.name
    `;

    const banks = rows as Array<{ pending: number; last_fetch: string | null; available: boolean }>;
    // Resiliente a que promo_reports aún no exista (código desplegado antes del schema).
    let pendingReports = 0;
    try {
      const reportRows = await sql`SELECT COUNT(*)::int AS n FROM promo_reports WHERE status = 'pending'`;
      pendingReports = (reportRows[0] as { n: number } | undefined)?.n ?? 0;
    } catch {
      pendingReports = 0;
    }

    const totals = {
      backlog: banks.reduce((a, b) => a + (b.pending || 0), 0),
      banks_total: banks.length,
      banks_never_fetched: banks.filter((b) => !b.last_fetch).length,
      pending_reports: pendingReports,
    };

    return NextResponse.json({ banks: rows, totals }, { headers: NO_CACHE });
  } catch (err) {
    console.error("GET /api/admin/ops/overview failed:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500, headers: NO_CACHE });
  }
}
