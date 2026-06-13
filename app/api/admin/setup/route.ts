import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { hashPassword, generateTotpSecret, generateTotpUri } from "@/lib/admin-auth";
import QRCode from "qrcode";

// One-time bootstrap endpoint — only works while ADMIN_SETUP_TOKEN env var is set.
// Remove ADMIN_SETUP_TOKEN from Vercel env vars after creating your first admin.
export async function POST(req: NextRequest) {
  const setupToken = process.env.ADMIN_SETUP_TOKEN;
  if (!setupToken) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: { setup_token?: string; email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.setup_token || body.setup_token !== setupToken) {
    return NextResponse.json({ error: "Invalid setup token" }, { status: 403 });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Email inválido" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "La contraseña debe tener al menos 8 caracteres" }, { status: 400 });
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
