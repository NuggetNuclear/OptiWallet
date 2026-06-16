/**
 * Encryption-at-rest for TOTP secrets (AES-256-GCM).
 *
 * The TOTP shared secret is a bearer credential: anyone holding it can mint
 * valid 2FA codes. Storing it in plaintext means a single DB read (leak, dump,
 * SQL access) defeats the second factor entirely. We encrypt it with an
 * authenticated cipher so the database alone is not enough — the app secret is
 * also required.
 *
 * These helpers run only in Node route handlers and CLI scripts (never the
 * edge/client), so `node:crypto` is available. The `node:crypto` import also
 * acts as the client guard: importing this module from a Client Component is a
 * build error (node:crypto cannot be bundled for the browser), so the cipher
 * logic and the key can never reach the client bundle.
 *
 * Key: derived via scrypt from `ADMIN_TOTP_ENC_KEY` (preferred, dedicated) or
 * `ADMIN_SESSION_SECRET` (fallback). A dedicated key is strongly recommended in
 * production so rotating the session secret doesn't orphan stored TOTP secrets.
 *
 * Format: `v1.<iv>.<ciphertext>.<authTag>` (each part base64url).
 * Backward compatible: a value without the `v1.` prefix is treated as legacy
 * plaintext and returned as-is, so existing rows keep working until migrated.
 */

import { scryptSync, randomBytes, createCipheriv, createDecipheriv, timingSafeEqual } from "node:crypto";

const PREFIX = "v1.";
const KEY_SALT = "optiwallet.totp.v1"; // fixed salt — entropy comes from the app secret

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const src = process.env.ADMIN_TOTP_ENC_KEY || process.env.ADMIN_SESSION_SECRET;
  if (!src) {
    throw new Error(
      "ADMIN_TOTP_ENC_KEY (o ADMIN_SESSION_SECRET) es requerido para cifrar los secretos TOTP",
    );
  }
  cachedKey = scryptSync(src, KEY_SALT, 32);
  return cachedKey;
}

/** True if the stored value is in the encrypted `v1.` envelope. */
export function isEncrypted(stored: string): boolean {
  return stored.startsWith(PREFIX);
}

/** Encrypts a plaintext TOTP secret into the `v1.` envelope. */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + [iv, ct, tag].map((b) => b.toString("base64url")).join(".");
}

/**
 * Decrypts a stored TOTP secret. Legacy plaintext (no `v1.` prefix) is returned
 * unchanged so the system keeps working before/while migrating existing rows.
 */
export function decryptSecret(stored: string): string {
  if (!isEncrypted(stored)) return stored; // legacy plaintext
  const parts = stored.split(".");
  if (parts.length !== 4) throw new Error("Formato de secreto TOTP cifrado inválido");
  const [, ivB, ctB, tagB] = parts;
  const iv = Buffer.from(ivB, "base64url");
  const ct = Buffer.from(ctB, "base64url");
  const tag = Buffer.from(tagB, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

// Re-exported for tests / completeness; constant-time compare for any future use.
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
