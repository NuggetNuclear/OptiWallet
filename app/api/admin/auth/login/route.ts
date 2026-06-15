import { sql } from "@/lib/db";
import { verifyPassword } from "@/lib/admin-auth";
import { signSession, signPendingMfa, setSessionCookie } from "@/lib/admin-session";
import { clientIp, isRateLimited, recordFailedAttempt, readTokenVersion } from "@/lib/admin-guard";
import type { AdminUser } from "@/lib/admin-types";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const ip = clientIp(req);

  try {
    if (await isRateLimited(ip)) {
      return NextResponse.json(
        { error: "Demasiados intentos. Espera 15 minutos." },
        { status: 429 },
      );
    }

    const body = await req.json().catch(() => null);
    const { email, password } = body ?? {};

    if (!email || !password) {
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
      return NextResponse.json({ error: "Credenciales inválidas" }, { status: 401 });
    }

    if (!user.totp_enabled) {
      // No TOTP yet — issue full session; proxy will redirect to /admin/totp-setup
      const token = await signSession({
        adminId: user.id,
        email: user.email,
        totp_enabled: false,
        tv: await readTokenVersion(user.id),
      });
      const res = NextResponse.json({ status: "ok", totp_enabled: false });
      setSessionCookie(res, token);
      return res;
    }

    // TOTP enabled — issue a short-lived pending-MFA token
    const mfaToken = await signPendingMfa(user.id);
    return NextResponse.json({ status: "mfa_required", mfa_token: mfaToken });
  } catch (err) {
    console.error("POST /api/admin/auth/login failed:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
