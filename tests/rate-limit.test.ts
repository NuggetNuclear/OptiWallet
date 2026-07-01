import { describe, it } from "node:test";
import { strictEqual } from "node:assert";
import { fixedWindowRateLimit } from "../lib/rate-limit.ts";

// El limiter usa Date.now() real; las llamadas secuenciales de un test ocurren
// dentro de la misma ventana (ms), así que no se resetea sola. Usamos una key
// única por test para no cruzar estado con otros (el Map es a nivel de módulo).

describe("fixedWindowRateLimit — ventana fija en memoria", () => {
  it("permite hasta `limit` y bloquea a partir de limit+1", () => {
    const key = "test:basico";
    strictEqual(fixedWindowRateLimit(key, 3, 10_000), false); // 1
    strictEqual(fixedWindowRateLimit(key, 3, 10_000), false); // 2
    strictEqual(fixedWindowRateLimit(key, 3, 10_000), false); // 3
    strictEqual(fixedWindowRateLimit(key, 3, 10_000), true);  // 4 → excede
    strictEqual(fixedWindowRateLimit(key, 3, 10_000), true);  // 5 → sigue bloqueado
  });

  it("cada key se cuenta por separado", () => {
    strictEqual(fixedWindowRateLimit("test:a", 1, 10_000), false);
    strictEqual(fixedWindowRateLimit("test:a", 1, 10_000), true);
    // key distinta no está afectada por la anterior
    strictEqual(fixedWindowRateLimit("test:b", 1, 10_000), false);
  });

  it("limit 0 bloquea desde la primera llamada", () => {
    strictEqual(fixedWindowRateLimit("test:cero", 0, 10_000), true);
  });
});
