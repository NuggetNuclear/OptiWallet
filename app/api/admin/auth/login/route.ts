import { sql } from "@/lib/db";
import { verifyPassword } from "@/lib/admin-auth";
import { signSession, signPendingMfa, setSessionCookie } from "@/lib/admin-session";
import type { AdminUser } from "@/lib/admin-types";
import { NextRequest, NextResponse } from "next/server";

const MAX_ATTEMPTS = 5;
const WINDOW_MS    = 15 * 60 * 1000; // 15 minutes

async function isRateLimited(ip: string): Promise<boolean> {
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const rows = await sql`
    SELECT COUNT(*)::int AS n
    FROM admin_login_attempts
    WHERE ip_address = ${ip} AND attempted_at >= ${since}::timestamptz
  `;
  return (rows[0] as { n: number }).n >= MAX_ATTEMPTS;
}

async function recordAttempt(ip: string): Promise<void> {
  await sql`INSERT INTO admin_login_attempts (ip_address) VALUES (${ip})`;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

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
    const fakeHash = "$2b$12$invalidhashtopreventtimingattacks.invalidhash";
    const valid = await verifyPassword(password, user?.password_hash ?? fakeHash);

    if (!user || !valid) {
      await recordAttempt(ip);
      return NextResponse.json({ error: "Credenciales inválidas" }, { status: 401 });
    }

    if (!user.totp_enabled) {
      // No TOTP yet — issue full session; proxy will redirect to /admin/totp-setup
      const token = await signSession({
        adminId: user.id,
        email: user.email,
        totp_enabled: false,
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
