/**
 * Bootstrap the first admin user.
 * Run with: npm run admin:create
 * Requires DATABASE_URL in .env.local.
 */

import { neon } from "@neondatabase/serverless";
import { hashPassword, generateTotpSecret, generateTotpUri } from "../lib/admin-auth.ts";
import { encryptSecret } from "../lib/admin-crypto.ts";
import QRCode from "qrcode";
import { createInterface } from "readline";

if (!process.env.DATABASE_URL) {
  console.error("❌  DATABASE_URL no está definida — crea un .env.local primero");
  process.exit(1);
}

if (!process.env.ADMIN_SESSION_SECRET && !process.env.ADMIN_TOTP_ENC_KEY) {
  console.error("❌  ADMIN_TOTP_ENC_KEY o ADMIN_SESSION_SECRET es requerido para cifrar el secreto TOTP");
  process.exit(1);
}

const db = neon(process.env.DATABASE_URL);

function ask(prompt: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function askPassword(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    let password = "";

    const handler = (key: string) => {
      if (key === "\r" || key === "\n") {
        process.stdin.setRawMode(false);
        process.stdin.removeListener("data", handler);
        process.stdout.write("\n");
        resolve(password);
      } else if (key === "") {
        process.exit(0);
      } else if (key === "") {
        if (password.length > 0) {
          password = password.slice(0, -1);
          process.stdout.write("\b \b");
        }
      } else {
        password += key;
        process.stdout.write("*");
      }
    };

    process.stdin.on("data", handler);
  });
}

function slugify(email: string): string {
  const prefix = email.split("@")[0].toLowerCase().replace(/[^a-z0-9]/g, "-");
  const suffix = Math.random().toString(36).slice(2, 6);
  return `admin-${prefix}-${suffix}`;
}

async function main() {
  console.log("\n🔐  Crear primer administrador de OptiWallet\n");

  const email = await ask("Email: ");
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error("❌  Email inválido");
    process.exit(1);
  }

  const password = await askPassword("Contraseña (mín. 12 caracteres): ");
  if (password.length < 12) {
    console.error("❌  La contraseña debe tener al menos 12 caracteres");
    process.exit(1);
  }

  const existing = await db`SELECT id FROM admin_users WHERE email = ${email}`;
  if (existing.length > 0) {
    console.error(`❌  Ya existe un admin con el email ${email}`);
    process.exit(1);
  }

  console.log("\n⏳  Generando hash bcrypt (cost 12)…");
  const hash   = await hashPassword(password);
  const secret = generateTotpSecret();
  const uri    = generateTotpUri(email, secret);
  const id     = slugify(email);

  await db`
    INSERT INTO admin_users (id, email, password_hash, totp_secret, totp_enabled)
    VALUES (${id}, ${email}, ${hash}, ${encryptSecret(secret)}, false)
  `;

  const qr = await QRCode.toString(uri, { type: "terminal", small: true });
  console.log("\n✅  Admin creado. Escanea este QR con Google Authenticator:\n");
  console.log(qr);
  console.log(`URI manual: ${uri}\n`);
  console.log(`ID: ${id} | Email: ${email}`);
  console.log("\n⚠️   Guarda la contraseña — no se puede recuperar.\n");
}

main().catch((err) => {
  console.error("❌  Error:", err);
  process.exit(1);
});
