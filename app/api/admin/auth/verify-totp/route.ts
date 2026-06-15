import { sql } from "@/lib/db";
import { verifyTotp } from "@/lib/admin-auth";
import { decryptSecret } from "@/lib/admin-crypto";
import { verifyPendingMfa, signSession, setSessionCookie } from "@/lib/admin-session";
import { clientIp, isRateLimited, recordFailedAttempt, readTokenVersion } from "@/lib/admin-guard";
import { logAdminAction } from "@/lib/admin-log";
import type { AdminUser } from "@/lib/admin-types";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const ip = clientIp(req);

  try {
    // A valid password gets you a mfa_token; without throttling here the 6-digit
    // TOTP could be brute-forced within the token's lifetime. Same IP budget as
    // the password step.
    if (await isRateLimited(ip)) {
      return NextResponse.json(
        { error: "Demasiados intentos. Espera 15 minutos." },
        { status: 429 },
      );
    }

    const body = await req.json().catch(() => null);
    const { mfa_token, code } = body ?? {};

    if (!mfa_token || !code) {
      return NextResponse.json({ error: "Token y código requeridos" }, { status: 400 });
    }

    const adminId = await verifyPendingMfa(mfa_token);
    if (!adminId) {
      await recordFailedAttempt(ip);
      return NextResponse.json({ error: "Token inválido o expirado" }, { status: 401 });
    }

    const rows = await sql`
      SELECT id, email, totp_secret FROM admin_users WHERE id = ${adminId}
    `;
    const user = rows[0] as Pick<AdminUser, "id" | "email" | "totp_secret"> | undefined;
    if (!user) {
      await recordFailedAttempt(ip);
      return NextResponse.json({ error: "Token inválido o expirado" }, { status: 401 });
    }

    if (!verifyTotp(decryptSecret(user.totp_secret), code)) {
      await recordFailedAttempt(ip);
      return NextResponse.json({ error: "Código inválido" }, { status: 401 });
    }

    await sql`UPDATE admin_users SET last_login_at = now() WHERE id = ${adminId}`;

    const session = {
      adminId: user.id,
      email: user.email,
      totp_enabled: true,
      tv: await readTokenVersion(user.id),
    };
    const token = await signSession(session);
    const res = NextResponse.json({ status: "ok" });
    setSessionCookie(res, token);

    await logAdminAction(session, "login", "auth", null, `Inicio de sesión desde ${ip}`, ip);

    return res;
  } catch (err) {
    console.error("POST /api/admin/auth/verify-totp failed:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
