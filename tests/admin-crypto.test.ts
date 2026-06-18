import { describe, it } from "node:test";
import { strictEqual, notStrictEqual, ok, throws, match } from "node:assert";
import { execFileSync } from "node:child_process";

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

  it("integridad GCM: un ciphertext manipulado falla la autenticacion", () => {
    const enc = encryptSecret(SECRET);
    const parts = enc.split("."); // [v1, iv, ct, tag]
    // Invertir el ciphertext rompe el authTag esperado -> decipher.final() lanza
    const tampered = [parts[0], parts[1], parts[2].split("").reverse().join(""), parts[3]].join(".");
    throws(() => decryptSecret(tampered));
  });

  it("safeEqual compara en tiempo constante", () => {
    ok(safeEqual("abc", "abc"));
    ok(!safeEqual("abc", "abd"));
    ok(!safeEqual("abc", "abcd"));
  });
});

// getKey() cachea la clave a nivel de modulo, asi que el camino "sin clave"
// (fail-closed) solo es observable en un proceso fresco sin las env vars.
describe("admin-crypto — fail-closed sin clave configurada", () => {
  it("encryptSecret lanza si faltan ADMIN_TOTP_ENC_KEY y ADMIN_SESSION_SECRET", () => {
    const script =
      "const m = await import('./lib/admin-crypto.ts'); m.encryptSecret('x');";
    throws(() =>
      execFileSync(process.execPath, ["--input-type=module", "-e", script], {
        cwd: process.cwd(),
        env: { PATH: process.env.PATH }, // sin ADMIN_TOTP_ENC_KEY ni ADMIN_SESSION_SECRET
        stdio: "pipe",
      }),
    );
  });

  it("el mensaje de error menciona la variable requerida", () => {
    const script =
      "const m = await import('./lib/admin-crypto.ts'); m.encryptSecret('x');";
    try {
      execFileSync(process.execPath, ["--input-type=module", "-e", script], {
        cwd: process.cwd(),
        env: { PATH: process.env.PATH },
        stdio: "pipe",
      });
      ok(false, "deberia haber lanzado");
    } catch (e) {
      const err = e as { stderr?: Buffer };
      match(String(err.stderr ?? ""), /ADMIN_TOTP_ENC_KEY/);
    }
  });
});
