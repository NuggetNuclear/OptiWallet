import { sql } from "@/lib/db";
import { requireAdmin, clientIp } from "@/lib/admin-guard";
import { logAdminAction } from "@/lib/admin-log";
import { NextRequest, NextResponse } from "next/server";

const NO_CACHE = { "Cache-Control": "no-store" };

/**
 * POST /api/admin/ops/staging/[id]/reject
 * Marca una fila de staging como rechazada (no entra a promotions).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin(req);
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401, headers: NO_CACHE });
  }
  try {
    const { id } = await params;
    if (!/^\d+$/.test(id)) {
      return NextResponse.json({ error: "id inválido" }, { status: 400, headers: NO_CACHE });
    }
    const rows = await sql`SELECT status, merchant_name FROM promo_staging WHERE id = ${Number(id)}`;
    const row = rows[0] as { status: string; merchant_name: string } | undefined;
    if (!row) {
      return NextResponse.json({ error: "Fila no encontrada" }, { status: 404, headers: NO_CACHE });
    }
    if (row.status !== "pending") {
      return NextResponse.json({ error: `Esta fila ya fue ${row.status === "approved" ? "aprobada" : "rechazada"}` }, { status: 409, headers: NO_CACHE });
    }
    await sql`
      UPDATE promo_staging
      SET status = 'rejected', reviewed_at = now(), reviewed_by = ${session.email}
      WHERE id = ${Number(id)}
    `;
    await logAdminAction(session, "reject", "promo_staging", id, `Rechazada en staging: ${row.merchant_name}`, clientIp(req));
    return NextResponse.json({ ok: true }, { headers: NO_CACHE });
  } catch (err) {
    console.error("POST /api/admin/ops/staging/[id]/reject failed:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500, headers: NO_CACHE });
  }
}
