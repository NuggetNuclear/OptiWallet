import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { hashPassword, generateTotpSecret, generateTotpUri, verifyTotp } from "@/lib/admin-auth";
import { clientIp, isRateLimited, recordFailedAttempt } from "@/lib/admin-guard";
import QRCode from "qrcode";

// Minimum password length — kept in sync with the admin-create API (12 chars).
const MIN_PASSWORD = 12;

// Step 1 — create first admin (only works when admin_users table is empty)
async function handleCreate(body: Record<string, unknown>) {
  const email = (String(body.email ?? "")).trim().toLowerCase();
  const password = String(body.password ?? "");

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Email inválido" }, { status: 400 });
  }
  if (password.length < MIN_PASSWORD) {
    return NextResponse.json({ error: `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres` }, { status: 400 });
  }

  const existing = await sql`SELECT id FROM admin_users LIMIT 1`;
  if (existing.length > 0) {
    return NextResponse.json(
      { error: "Ya existe al menos un admin. Usa el panel para agregar más." },
      { status: 409 },
    );
  }

  const id = `admin-${Math.random().toString(36).slice(2, 8)}`;
  const passwordHash = await hashPassword(password);
  const totpSecret = generateTotpSecret();
  const totpUri = generateTotpUri(email, totpSecret);
  const qrDataUrl = await QRCode.toDataURL(totpUri, { width: 300, margin: 2 });

  await sql`
    INSERT INTO admin_users (id, email, password_hash, totp_secret, totp_enabled)
    VALUES (${id}, ${email}, ${passwordHash}, ${totpSecret}, false)
  `;

  return NextResponse.json({ id, email, qr_data_url: qrDataUrl, totp_uri: totpUri }, { status: 201 });
}

// Step 2 — verify TOTP code and activate 2FA
async function handleVerify(body: Record<string, unknown>, ip: string) {
  const adminId = String(body.admin_id ?? "");
  const code = String(body.code ?? "");

  if (!adminId || !code) {
    return NextResponse.json({ error: "Faltan campos" }, { status: 400 });
  }

  const rows = await sql`
    SELECT totp_secret, totp_enabled FROM admin_users WHERE id = ${adminId}
  `;
  if (rows.length === 0) {
    await recordFailedAttempt(ip);
    return NextResponse.json({ error: "Admin no encontrado" }, { status: 404 });
  }

  const { totp_secret, totp_enabled } = rows[0] as { totp_secret: string; totp_enabled: boolean };

  if (totp_enabled) {
    return NextResponse.json({ error: "TOTP ya está activado" }, { status: 409 });
  }

  if (!verifyTotp(totp_secret, code)) {
    await recordFailedAttempt(ip);
    return NextResponse.json({ error: "Código incorrecto. Revisa que el reloj de tu teléfono esté sincronizado." }, { status: 401 });
  }

  await sql`UPDATE admin_users SET totp_enabled = true WHERE id = ${adminId}`;

  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req);

  // Throttle the public setup endpoint too — it both creates the first admin
  // and verifies a TOTP code, so it must not be a free brute-force surface.
  if (await isRateLimited(ip)) {
    return NextResponse.json(
      { error: "Demasiados intentos. Espera 15 minutos." },
      { status: 429 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.action === "verify") return handleVerify(body, ip);
  return handleCreate(body);
}
