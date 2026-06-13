import { describe, it, expect } from "vitest";
import { effectiveDateFor, parseDiaParam } from "@/lib/hooks/use-today";

describe("parseDiaParam", () => {
  it("acepta 0..6", () => {
    expect(parseDiaParam("0")).toBe(0);
    expect(parseDiaParam("6")).toBe(6);
  });
  it("rechaza null / fuera de rango / no entero", () => {
    expect(parseDiaParam(null)).toBeNull();
    expect(parseDiaParam("7")).toBeNull();
    expect(parseDiaParam("-1")).toBeNull();
    expect(parseDiaParam("abc")).toBeNull();
    expect(parseDiaParam("3.5")).toBeNull();
  });
});

describe("effectiveDateFor", () => {
  it("si el día seleccionado es hoy, devuelve la misma fecha", () => {
    const today = new Date(2026, 5, 13); // sábado (dow 6)
    expect(effectiveDateFor(today, today.getDay())).toBe(today);
  });

  it("devuelve la próxima ocurrencia del día de la semana elegido", () => {
    const today = new Date(2026, 5, 13); // sábado (6)
    const monday = effectiveDateFor(today, 1); // próximo lunes
    expect(monday.getDay()).toBe(1);
    // diff = (1 - 6 + 7) % 7 = 2 → 15 de junio
    expect(monday.getDate()).toBe(15);
  });
});
