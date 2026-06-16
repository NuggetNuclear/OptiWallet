import { describe, it } from "node:test";
import { strictEqual, notStrictEqual, ok, throws } from "node:assert";

// Set a key before importing so the lazy getKey() can derive one.
process.env.ADMIN_TOTP_ENC_KEY = "test-key-do-not-use-in-production-0123456789";

const { encryptSecret, decryptSecret, isEncrypted, safeEqual } = await import("../lib/admin-crypto.ts");

describe("admin-crypto — cifrado de secretos TOTP", () => {
  const SECRET = "JBSWY3DPEHPK3PXP"; // base32 TOTP secret de ejemplo

  it("roundtrip: decrypt(encrypt(x)) === x", () => {
    const enc = encryptSecret(SECRET);
    strictEqual(decryptSecret(enc), SECRET);
  });

  it("el texto cifrado no contiene el plaintext", () => {
    const enc = encryptSecret(SECRET);
    ok(!enc.includes(SECRET));
  });

  it("usa el envoltorio v1. y es detectable", () => {
    const enc = encryptSecret(SECRET);
    ok(enc.startsWith("v1."));
    ok(isEncrypted(enc));
  });

  it("cada cifrado usa un IV distinto (no determinista)", () => {
    notStrictEqual(encryptSecret(SECRET), encryptSecret(SECRET));
  });

  it("compatibilidad: plaintext legacy se devuelve tal cual", () => {
    ok(!isEncrypted(SECRET));
    strictEqual(decryptSecret(SECRET), SECRET);
  });

  it("rechaza un envoltorio v1. malformado", () => {
    throws(() => decryptSecret("v1.aaa.bbb"));
  });

  it("safeEqual compara en tiempo constante", () => {
    ok(safeEqual("abc", "abc"));
    ok(!safeEqual("abc", "abd"));
    ok(!safeEqual("abc", "abcd"));
  });
});
