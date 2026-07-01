import { sql } from "@/lib/db";
import { requireAdmin, clientIp } from "@/lib/admin-guard";
import { logAdminAction } from "@/lib/admin-log";
import { isValidId } from "@/lib/validate";
import { NextRequest, NextResponse } from "next/server";

const NO_CACHE = { "Cache-Control": "no-store" };

// POST /api/admin/ops/reports/resolve  { promotion_id, status: 'resolved' | 'dismissed' }
// Marca todos los reportes PENDIENTES de una promo como resueltos o descartados.
export async function POST(req: NextRequest) {
  const session = await requireAdmin(req);
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401, headers: NO_CACHE });
  }
  try {
    const body = await req.json().catch(() => null);
    const promotionId = typeof body?.promotion_id === "string" ? body.promotion_id : "";
    const status = body?.status;

    if (!isValidId(promotionId)) {
      return NextResponse.json({ error: "promotion_id inválido" }, { status: 400, headers: NO_CACHE });
    }
    if (status !== "resolved" && status !== "dismissed") {
      return NextResponse.json({ error: "status inválido" }, { status: 400, headers: NO_CACHE });
    }

    const cnt = await sql`SELECT COUNT(*)::int AS n FROM promo_reports WHERE promotion_id = ${promotionId} AND status = 'pending'`;
    const n = (cnt[0] as { n: number } | undefined)?.n ?? 0;

    await sql`
      UPDATE promo_reports
      SET status = ${status}, resolved_at = now(), resolved_by = ${session.email}
      WHERE promotion_id = ${promotionId} AND status = 'pending'
    `;
    await logAdminAction(session, "update", "report", promotionId,
      `Reportes de ${promotionId} → ${status} (${n})`, clientIp(req));
    return NextResponse.json({ status: "ok", updated: n }, { headers: NO_CACHE });
  } catch (err) {
    console.error("POST /api/admin/ops/reports/resolve failed:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500, headers: NO_CACHE });
  }
}
