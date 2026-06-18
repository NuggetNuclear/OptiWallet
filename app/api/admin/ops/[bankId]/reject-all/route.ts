import { sql } from "@/lib/db";
import { requireAdmin, clientIp } from "@/lib/admin-guard";
import { logAdminAction } from "@/lib/admin-log";
import { isValidId } from "@/lib/validate";
import { NextRequest, NextResponse } from "next/server";

const NO_CACHE = { "Cache-Control": "no-store" };

export async function POST(req: NextRequest, { params }: { params: Promise<{ bankId: string }> }) {
  const session = await requireAdmin(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401, headers: NO_CACHE });

  const { bankId } = await params;
  if (!isValidId(bankId)) return NextResponse.json({ error: "bankId inválido" }, { status: 400, headers: NO_CACHE });

  try {
    const result = await sql`
      UPDATE promo_staging
      SET status = 'rejected', reviewed_at = now(), reviewed_by = ${session.email}
      WHERE bank_id = ${bankId} AND status = 'pending'
      RETURNING id
    `;
    const count = result.length;
    await logAdminAction(session, "reject", "promotion", bankId,
      `Descarte masivo: ${count} promos rechazadas en staging para ${bankId}`, clientIp(req));
    return NextResponse.json({ rejectedCount: count }, { headers: NO_CACHE });
  } catch (err) {
    console.error("POST /api/admin/ops/[bankId]/reject-all failed:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500, headers: NO_CACHE });
  }
}
