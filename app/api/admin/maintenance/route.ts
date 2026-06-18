/**
 * GET  /api/admin/maintenance  → estado actual (enabled, updatedAt, updatedBy)
 * POST /api/admin/maintenance  → cambia el estado, requiere TOTP del admin
 *
 * Body POST: { enabled: boolean, totp_code: string }
 *
 * El TOTP se exige en cada cambio (no solo al login) porque activar el modo
 * de mantenimiento tiene impacto en todos los usuarios en tiempo real — una
 * sesión robada o un click accidental no debe poder hacerlo sin el 2FA físico.
 */

import { sql } from "@/lib/db";
import { requireAdmin, clientIp, isRateLimited, recordFailedAttempt } from "@/lib/admin-guard";
import { logAdminAction } from "@/lib/admin-log";
import { verifyTotp } from "@/lib/admin-auth";
import { decryptSecret } from "@/lib/admin-crypto";
import { getMaintenanceStatus, setMaintenanceMode } from "@/lib/maintenance";
import { NextRequest, NextResponse } from "next/server";

const NO_CACHE = { "Cache-Control": "no-store" };

export async function GET(req: NextRequest) {
  const session = await requireAdmin(req);
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401, headers: NO_CACHE });
  }
  const status = await getMaintenanceStatus();
  return NextResponse.json(status, { headers: NO_CACHE });
}

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

  const body = await req.json().catch(() => null);
  const { enabled, totp_code } = body ?? {};

  if (typeof enabled !== "boolean") {
    return NextResponse.json({ error: "Campo 'enabled' requerido (boolean)" }, { status: 400, headers: NO_CACHE });
  }
  if (!totp_code || typeof totp_code !== "string" || !/^\d{6}$/.test(totp_code.replace(/\s/g, ""))) {
    return NextResponse.json({ error: "Código TOTP de 6 dígitos requerido" }, { status: 400, headers: NO_CACHE });
  }

  // Verificar TOTP del admin en cada cambio de estado
  const rows = await sql`SELECT totp_secret FROM admin_users WHERE id = ${session.adminId}`;
  const user = rows[0] as { totp_secret: string } | undefined;
  if (!user) {
    return NextResponse.json({ error: "Admin no encontrado" }, { status: 404, headers: NO_CACHE });
  }

  let secret: string;
  try {
    secret = decryptSecret(user.totp_secret);
  } catch {
    return NextResponse.json({ error: "Error interno de cifrado" }, { status: 500, headers: NO_CACHE });
  }

  const valid = verifyTotp(secret, totp_code.replace(/\s/g, ""));
  if (!valid) {
    await recordFailedAttempt(ip);
    return NextResponse.json({ error: "Código TOTP incorrecto" }, { status: 401, headers: NO_CACHE });
  }

  await setMaintenanceMode(enabled, session.email);
  await logAdminAction(
    session,
    enabled ? "maintenance_on" : "maintenance_off",
    "app_settings",
    "maintenance_mode",
    `Modo mantenimiento ${enabled ? "ACTIVADO" : "DESACTIVADO"} por ${session.email}`,
    ip
  );

  return NextResponse.json({ ok: true, enabled }, { headers: NO_CACHE });
}
