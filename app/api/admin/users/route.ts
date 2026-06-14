import { sql } from "@/lib/db";
import { hashPassword, generateTotpSecret, generateTotpUri } from "@/lib/admin-auth";
import { requireAdmin } from "@/lib/admin-guard";
import QRCode from "qrcode";
import { NextRequest, NextResponse } from "next/server";

const NO_CACHE = { "Cache-Control": "no-store" };

function slugify(email: string): string {
  const prefix = email.split("@")[0].toLowerCase().replace(/[^a-z0-9]/g, "-");
  const suffix = Math.random().toString(36).slice(2, 6);
  return `admin-${prefix}-${suffix}`;
}

export async function GET(req: NextRequest) {
  if (!await requireAdmin(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401, headers: NO_CACHE });
  }
  try {
    const rows = await sql`
      SELECT id, email, totp_enabled, created_at, last_login_at
      FROM admin_users
      ORDER BY created_at ASC
    `;
    return NextResponse.json(rows, { headers: NO_CACHE });
  } catch (err) {
    console.error("GET /api/admin/users failed:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500, headers: NO_CACHE });
  }
}

export async function POST(req: NextRequest) {
  if (!await requireAdmin(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401, headers: NO_CACHE });
  }
  try {
    const body = await req.json().catch(() => null);
    const { email, password } = body ?? {};

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Email inválido" }, { status: 400, headers: NO_CACHE });
    }
    if (!password || password.length < 12) {
      return NextResponse.json({ error: "La contraseña debe tener al menos 12 caracteres" }, { status: 400, headers: NO_CACHE });
    }

    const existing = await sql`SELECT id FROM admin_users WHERE email = ${email}`;
    if (existing.length > 0) {
      return NextResponse.json({ error: "Ya existe un admin con ese email" }, { status: 409, headers: NO_CACHE });
    }

    const id           = slugify(email);
    const passwordHash = await hashPassword(password);
    const totpSecret   = generateTotpSecret();
    const totpUri      = generateTotpUri(email, totpSecret);
    const qrDataUrl    = await QRCode.toDataURL(totpUri);

    await sql`
      INSERT INTO admin_users (id, email, password_hash, totp_secret, totp_enabled)
      VALUES (${id}, ${email}, ${passwordHash}, ${totpSecret}, false)
    `;

    return NextResponse.json(
      { id, email, totp_uri: totpUri, qr_data_url: qrDataUrl },
      { status: 201, headers: NO_CACHE },
    );
  } catch (err) {
    console.error("POST /api/admin/users failed:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500, headers: NO_CACHE });
  }
}
