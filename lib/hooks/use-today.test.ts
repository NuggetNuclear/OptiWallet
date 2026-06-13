import { describe, it } from "node:test";
import { strictEqual } from "node:assert";
import { effectiveDateFor, parseDiaParam } from "./use-today.ts";

describe("parseDiaParam", () => {
  it("acepta 0..6", () => {
    strictEqual(parseDiaParam("0"), 0);
    strictEqual(parseDiaParam("6"), 6);
  });
  it("rechaza null / fuera de rango / no entero", () => {
    strictEqual(parseDiaParam(null), null);
    strictEqual(parseDiaParam("7"), null);
    strictEqual(parseDiaParam("-1"), null);
    strictEqual(parseDiaParam("abc"), null);
    strictEqual(parseDiaParam("3.5"), null);
  });
});

describe("effectiveDateFor", () => {
  it("si el día seleccionado es hoy, devuelve la misma fecha", () => {
    const today = new Date(2026, 5, 13); // sábado (dow 6)
    strictEqual(effectiveDateFor(today, today.getDay()), today);
  });

  it("devuelve la próxima ocurrencia del día de la semana elegido", () => {
    const today = new Date(2026, 5, 13); // sábado (6)
    const monday = effectiveDateFor(today, 1); // próximo lunes
    strictEqual(monday.getDay(), 1);
    // diff = (1 - 6 + 7) % 7 = 2 → 15 de junio
    strictEqual(monday.getDate(), 15);
  });
});
