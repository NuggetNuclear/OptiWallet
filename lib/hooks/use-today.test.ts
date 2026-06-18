import { describe, it } from "node:test";
import { strictEqual, ok } from "node:assert";
import { effectiveDateFor, parseDiaParam } from "./use-today.ts";

// ──────────────────────────── parseDiaParam ───────────────────────────────────

describe("parseDiaParam — validacion del query param ?dia=", () => {
  it("acepta todos los valores validos 0..6", () => {
    for (let i = 0; i <= 6; i++) {
      strictEqual(parseDiaParam(String(i)), i, 'debe aceptar "' + i + '"');
    }
  });

  it("null -> null (param ausente en la URL)", () => {
    strictEqual(parseDiaParam(null), null);
  });

  it("7 -> null (fuera de rango)", () => strictEqual(parseDiaParam("7"), null));
  it("-1 -> null (negativo)", () => strictEqual(parseDiaParam("-1"), null));
  it("string no numerico -> null", () => {
    strictEqual(parseDiaParam("abc"), null);
    strictEqual(parseDiaParam("lunes"), null);
  });
  it("float con decimales -> null", () => {
    strictEqual(parseDiaParam("3.5"), null);
    strictEqual(parseDiaParam("1.9"), null);
  });
  it("numero muy grande -> null", () => strictEqual(parseDiaParam("100"), null));
});

// ──────────────────────────── effectiveDateFor ────────────────────────────────

describe("effectiveDateFor — fecha efectiva para queries", () => {
  // 13 jun 2026 = Sabado (dow = 6)
  const sabado13jun = new Date(2026, 5, 13);

  it("si el dia seleccionado es hoy, devuelve la misma referencia", () => {
    const result = effectiveDateFor(sabado13jun, 6);
    strictEqual(result, sabado13jun);
  });

  it("proximo lunes desde sabado: diff=2 -> 15 jun", () => {
    // diff = (1 - 6 + 7) % 7 = 2
    const result = effectiveDateFor(sabado13jun, 1);
    strictEqual(result.getDay(), 1);
    strictEqual(result.getDate(), 15);
    strictEqual(result.getMonth(), 5); // junio
  });

  it("proximo domingo desde sabado: diff=1 -> 14 jun", () => {
    // diff = (0 - 6 + 7) % 7 = 1
    const result = effectiveDateFor(sabado13jun, 0);
    strictEqual(result.getDay(), 0);
    strictEqual(result.getDate(), 14);
  });

  it("proximo viernes desde sabado: diff=6 -> 19 jun", () => {
    // diff = (5 - 6 + 7) % 7 = 6
    const result = effectiveDateFor(sabado13jun, 5);
    strictEqual(result.getDay(), 5);
    strictEqual(result.getDate(), 19);
  });

  it("cruza cambio de mes: 29 jun (lunes) -> proximo sabado = 4 jul", () => {
    // diff = (6 - 1 + 7) % 7 = 5 -> 4 jul 2026 (sabado)
    const lunes29jun = new Date(2026, 5, 29);
    const result = effectiveDateFor(lunes29jun, 6);
    strictEqual(result.getDay(), 6);
    strictEqual(result.getMonth(), 6); // julio
    strictEqual(result.getDate(), 4);
  });

  it("el resultado siempre es >= hoy para cualquier dia seleccionado", () => {
    for (let dow = 0; dow <= 6; dow++) {
      const result = effectiveDateFor(sabado13jun, dow);
      ok(
        result.getTime() >= sabado13jun.getTime(),
        "effectiveDateFor(sab, " + dow + ") debe ser >= hoy"
      );
    }
  });

  it("no muta el objeto today original", () => {
    const hoy = new Date(2026, 5, 13);
    const originalTime = hoy.getTime();
    effectiveDateFor(hoy, 1);
    strictEqual(hoy.getTime(), originalTime);
  });
});
