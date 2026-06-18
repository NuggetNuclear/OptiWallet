import { sql } from "@/lib/db";
import { verifyPassword } from "@/lib/admin-auth";
import { signSession, signPendingMfa, setSessionCookie } from "@/lib/admin-session";
import { clientIp, isRateLimited, recordFailedAttempt, readTokenVersion } from "@/lib/admin-guard";
import { logAdminAction } from "@/lib/admin-log";
import type { AdminUser } from "@/lib/admin-types";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const ua = req.headers.get("user-agent") || "desconocido";
  const referer = req.headers.get("referer") || "ninguno";

  try {
    const body = await req.json().catch(() => null);
    const { email, password } = body ?? {};

    if (await isRateLimited(ip)) {
      await logAdminAction(
        { adminId: "unknown", email: email || "desconocido", totp_enabled: false },
        "login_failed",
        "auth",
        null,
        `Intento bloqueado por límite de tasa (Rate Limit). UA: ${ua} | Referer: ${referer}`,
        ip
      );
      return NextResponse.json(
        { error: "Demasiados intentos. Espera 15 minutos." },
        { status: 429 },
      );
    }

    if (!email || !password) {
      await logAdminAction(
        { adminId: "unknown", email: email || "desconocido", totp_enabled: false },
        "login_failed",
        "auth",
        null,
        `Intento fallido (faltan credenciales). UA: ${ua} | Referer: ${referer}`,
        ip
      );
      return NextResponse.json({ error: "Credenciales requeridas" }, { status: 400 });
    }

    const rows = await sql`
      SELECT id, email, password_hash, totp_secret, totp_enabled
      FROM admin_users
      WHERE email = ${email}
    `;
    const user = rows[0] as AdminUser | undefined;

    // Always run bcrypt compare to prevent timing-based email enumeration
    const fakeHash = "$2b$12$q7ComDA2C/FlyGndOFLq0u8nXxcTkww33BLaYkQavVurANOIUc/Wy";
    const valid = await verifyPassword(password, user?.password_hash ?? fakeHash);

    if (!user || !valid) {
      await recordFailedAttempt(ip);
      await logAdminAction(
        { adminId: user?.id ?? "unknown", email: email, totp_enabled: false },
        "login_failed",
        "auth",
        null,
        `Intento fallido (credenciales inválidas). UA: ${ua} | Referer: ${referer}`,
        ip
      );
      return NextResponse.json({ error: "Credenciales inválidas" }, { status: 401 });
    }

    if (!user.totp_enabled) {
      // No TOTP yet — issue full session; proxy will redirect to /admin/totp-setup
      const session = {
        adminId: user.id,
        email: user.email,
        totp_enabled: false,
        tv: await readTokenVersion(user.id),
      };
      const token = await signSession(session);
      const res = NextResponse.json({ status: "ok", totp_enabled: false });
      setSessionCookie(res, token);

      await logAdminAction(
        session,
        "login",
        "auth",
        null,
        `Inicio de sesión exitoso (sin 2FA). UA: ${ua} | Referer: ${referer}`,
        ip
      );
      return res;
    }

    // TOTP enabled — issue a short-lived pending-MFA token
    const mfaToken = await signPendingMfa(user.id);
    await logAdminAction(
      { adminId: user.id, email: user.email, totp_enabled: false },
      "login",
      "auth",
      null,
      `Paso 1 de inicio de sesión exitoso (requiere 2FA). UA: ${ua} | Referer: ${referer}`,
      ip
    );
    return NextResponse.json({ status: "mfa_required", mfa_token: mfaToken });
  } catch (err) {
    console.error("POST /api/admin/auth/login failed:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
