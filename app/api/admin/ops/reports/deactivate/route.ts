import { sql } from "@/lib/db";
import { requireAdmin, clientIp } from "@/lib/admin-guard";
import { logAdminAction } from "@/lib/admin-log";
import { isValidId } from "@/lib/validate";
import { NextRequest, NextResponse } from "next/server";

const NO_CACHE = { "Cache-Control": "no-store" };

// POST /api/admin/ops/reports/deactivate  { promotion_id }
// Baja una promo reportada (active=false) y da por resueltos sus reportes pendientes.
export async function POST(req: NextRequest) {
  const session = await requireAdmin(req);
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401, headers: NO_CACHE });
  }
  try {
    const body = await req.json().catch(() => null);
    const promotionId = typeof body?.promotion_id === "string" ? body.promotion_id : "";
    if (!isValidId(promotionId)) {
      return NextResponse.json({ error: "promotion_id inválido" }, { status: 400, headers: NO_CACHE });
    }

    const exists = await sql`SELECT id FROM promotions WHERE id = ${promotionId}`;
    if (!exists.length) {
      return NextResponse.json({ error: "Promoción no encontrada" }, { status: 404, headers: NO_CACHE });
    }

    await sql`UPDATE promotions SET active = false, updated_at = now() WHERE id = ${promotionId}`;
    await sql`
      UPDATE promo_reports
      SET status = 'resolved', resolved_at = now(), resolved_by = ${session.email}
      WHERE promotion_id = ${promotionId} AND status = 'pending'
    `;
    await logAdminAction(session, "update", "promotion", promotionId,
      "Desactivada desde reportes de usuarios", clientIp(req));
    return NextResponse.json({ status: "ok" }, { headers: NO_CACHE });
  } catch (err) {
    console.error("POST /api/admin/ops/reports/deactivate failed:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500, headers: NO_CACHE });
  }
}
