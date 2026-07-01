import { sql } from "@/lib/db";
import { verifyTotp } from "@/lib/admin-auth";
import { decryptSecret } from "@/lib/admin-crypto";
import { requireAdmin, clientIp, isRateLimited, recordFailedAttempt } from "@/lib/admin-guard";
import { logAdminAction } from "@/lib/admin-log";
import { areValidIds } from "@/lib/validate";
import { NextRequest, NextResponse } from "next/server";

const NO_CACHE = { "Cache-Control": "no-store" };

export async function POST(req: NextRequest) {
  const session = await requireAdmin(req);
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401, headers: NO_CACHE });
  }

  const ip = clientIp(req);
  if (await isRateLimited(ip)) {
    return NextResponse.json(
      { error: "Demasiados intentos. Espera 15 minutos." },
      { status: 429, headers: NO_CACHE }
    );
  }

  try {
    const body = await req.json().catch(() => null);
    const { ids, code } = body ?? {};

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "IDs de promociones requeridos" }, { status: 400, headers: NO_CACHE });
    }
    if (!ids.every((v: unknown): v is string => typeof v === "string") || !areValidIds(ids)) {
      return NextResponse.json({ error: "IDs de promociones inválidos" }, { status: 400, headers: NO_CACHE });
    }

    if (!code || typeof code !== "string") {
      return NextResponse.json({ error: "Código TOTP requerido" }, { status: 400, headers: NO_CACHE });
    }

    // Obtener secreto TOTP del admin actual
    const rows = await sql`
      SELECT totp_secret FROM admin_users WHERE id = ${session.adminId}
    `;
    const user = rows[0] as { totp_secret: string } | undefined;
    if (!user) {
      return NextResponse.json({ error: "Administrador no encontrado" }, { status: 404, headers: NO_CACHE });
    }

    // Verificar TOTP
    const decryptedSecret = decryptSecret(user.totp_secret);
    if (!verifyTotp(decryptedSecret, code)) {
      await recordFailedAttempt(ip);
      return NextResponse.json({ error: "Código de verificación inválido" }, { status: 401, headers: NO_CACHE });
    }

    // Eliminar promociones
    await sql`
      DELETE FROM promotions
      WHERE id = ANY(${ids})
    `;

    // Registrar acción en la bitácora
    await logAdminAction(
      session,
      "delete",
      "promotion",
      null,
      `Eliminación masiva de ${ids.length} promociones: ${ids.join(", ")}`,
      ip
    );

    return NextResponse.json({ status: "ok" }, { headers: NO_CACHE });
  } catch (err) {
    console.error("POST /api/admin/data/promotions/bulk-delete failed:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500, headers: NO_CACHE });
  }
}
