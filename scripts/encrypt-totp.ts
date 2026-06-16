/**
 * One-off migration: encrypt any plaintext TOTP secrets at rest.
 * Run with: npm run admin:encrypt-totp
 *
 * Idempotent — rows already in the `v1.` envelope are skipped. Safe to run
 * multiple times. Requires DATABASE_URL and ADMIN_TOTP_ENC_KEY (or
 * ADMIN_SESSION_SECRET) in the environment.
 */

import { neon } from "@neondatabase/serverless";
import { encryptSecret, isEncrypted } from "../lib/admin-crypto.ts";

if (!process.env.DATABASE_URL) {
  console.error("❌  DATABASE_URL no está definida — configura tu .env.local primero");
  process.exit(1);
}
if (!process.env.ADMIN_SESSION_SECRET && !process.env.ADMIN_TOTP_ENC_KEY) {
  console.error("❌  ADMIN_TOTP_ENC_KEY o ADMIN_SESSION_SECRET es requerido para cifrar");
  process.exit(1);
}

const db = neon(process.env.DATABASE_URL);

async function main() {
  const rows = (await db`SELECT id, totp_secret FROM admin_users`) as {
    id: string;
    totp_secret: string;
  }[];

  let migrated = 0;
  let skipped = 0;

  for (const { id, totp_secret } of rows) {
    if (isEncrypted(totp_secret)) {
      skipped++;
      continue;
    }
    await db`UPDATE admin_users SET totp_secret = ${encryptSecret(totp_secret)} WHERE id = ${id}`;
    migrated++;
    console.log(`🔐  cifrado: ${id}`);
  }

  console.log(`\n✅  Listo. ${migrated} cifrado(s), ${skipped} ya cifrado(s), ${rows.length} total.`);
}

main().catch((err) => {
  console.error("❌  Error:", err);
  process.exit(1);
});
