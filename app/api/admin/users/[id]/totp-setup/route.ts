import { sql } from "@/lib/db";
import { verifyTotp, generateTotpUri } from "@/lib/admin-auth";
import { decryptSecret } from "@/lib/admin-crypto";
import { getAdminFromRequest, signSession, setSessionCookie } from "@/lib/admin-session";
import { clientIp, isRateLimited, recordFailedAttempt, readTokenVersion } from "@/lib/admin-guard";
import { logAdminAction } from "@/lib/admin-log";
import QRCode from "qrcode";
import { NextRequest, NextResponse } from "next/server";

const NO_CACHE = { "Cache-Control": "no-store" };

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const session = await getAdminFromRequest(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401, headers: NO_CACHE });

  const { id } = await params;
  if (session.adminId !== id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403, headers: NO_CACHE });
  }

  try {
    const rows = await sql`SELECT email, totp_secret, totp_enabled FROM admin_users WHERE id = ${id}`;
    if (!rows.length) return NextResponse.json({ error: "No encontrado" }, { status: 404, headers: NO_CACHE });

    const { email, totp_secret, totp_enabled } = rows[0] as {
      email: string;
      totp_secret: string;
      totp_enabled: boolean;
    };

    // Once 2FA is active, don't re-expose the shared secret/QR: it's a bearer
    // credential and re-display only widens the leak surface. Re-enrollment goes
    // through an explicit reset (totp_enabled=false) by an admin. (audit L2)
    if (totp_enabled) {
      return NextResponse.json({ error: "TOTP ya está activo" }, { status: 400, headers: NO_CACHE });
    }

    const uri       = generateTotpUri(email, decryptSecret(totp_secret));
    const qrDataUrl = await QRCode.toDataURL(uri);

    return NextResponse.json({ totp_uri: uri, qr_data_url: qrDataUrl }, { headers: NO_CACHE });
  } catch (err) {
    console.error("GET /api/admin/users/[id]/totp-setup failed:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500, headers: NO_CACHE });
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await getAdminFromRequest(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401, headers: NO_CACHE });

  const { id } = await params;
  if (session.adminId !== id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403, headers: NO_CACHE });
  }

  const ip = clientIp(req);
  if (await isRateLimited(ip)) {
    return NextResponse.json(
      { error: "Demasiados intentos. Espera 15 minutos." },
      { status: 429, headers: NO_CACHE },
    );
  }

  try {
    const body = await req.json().catch(() => null);
    const { code } = body ?? {};

    if (!code) {
      return NextResponse.json({ error: "Código requerido" }, { status: 400, headers: NO_CACHE });
    }

    const rows = await sql`SELECT email, totp_secret, totp_enabled FROM admin_users WHERE id = ${id}`;
    if (!rows.length) return NextResponse.json({ error: "No encontrado" }, { status: 404, headers: NO_CACHE });

    const { email, totp_secret, totp_enabled } = rows[0] as {
      email: string;
      totp_secret: string;
      totp_enabled: boolean;
    };

    if (totp_enabled) {
      return NextResponse.json({ error: "TOTP ya está activo" }, { status: 400, headers: NO_CACHE });
    }

    if (!verifyTotp(decryptSecret(totp_secret), code)) {
      await recordFailedAttempt(ip);
      return NextResponse.json({ error: "Código inválido" }, { status: 401, headers: NO_CACHE });
    }

    await sql`
      UPDATE admin_users
      SET totp_enabled = true, last_login_at = now()
      WHERE id = ${id}
    `;

    // Upgrade the session cookie to reflect totp_enabled=true
    const newSession = { adminId: id, email, totp_enabled: true, tv: await readTokenVersion(id) };
    const newToken = await signSession(newSession);
    const res = NextResponse.json({ status: "ok" }, { headers: NO_CACHE });
    setSessionCookie(res, newToken);
    await logAdminAction(newSession, "totp_setup", "admin_user", id, `2FA configurado para ${email}`, ip);
    return res;
  } catch (err) {
    console.error("POST /api/admin/users/[id]/totp-setup failed:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500, headers: NO_CACHE });
  }
}
