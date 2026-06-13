import { describe, it } from "node:test";
import { strictEqual } from "node:assert";
import { isValidId, areValidIds } from "../lib/validate.ts";

describe("Validación de IDs (isValidId)", () => {
  it("acepta slugs válidos con letras, números, puntos, guiones y guiones bajos", () => {
    strictEqual(isValidId("bci"), true);
    strictEqual(isValidId("santander-credit"), true);
    strictEqual(isValidId("comida-rapida"), true);
    strictEqual(isValidId("copec_all.2026"), true);
    strictEqual(isValidId("12345"), true);
  });

  it("rechaza IDs que contengan espacios", () => {
    strictEqual(isValidId("bco chile"), false);
    strictEqual(isValidId(" santander"), false);
    strictEqual(isValidId("ripley "), false);
  });

  it("rechaza caracteres especiales de inyección o peligroso HTML", () => {
    strictEqual(isValidId("bci;DROP TABLE banks"), false);
    strictEqual(isValidId("copec' OR '1'='1"), false);
    strictEqual(isValidId("<script>alert(1)</script>"), false);
    strictEqual(isValidId("santander#"), false);
    strictEqual(isValidId("ripley?type=credit"), false);
    strictEqual(isValidId("bci\\credit"), false);
  });

  it("rechaza IDs vacíos", () => {
    strictEqual(isValidId(""), false);
  });

  it("rechaza IDs mayores de 64 caracteres", () => {
    const longId = "a".repeat(65);
    const validMaxLengthId = "a".repeat(64);
    strictEqual(isValidId(longId), false);
    strictEqual(isValidId(validMaxLengthId), true);
  });
});

describe("Validación grupal de IDs (areValidIds)", () => {
  it("retorna true para un array vacío", () => {
    strictEqual(areValidIds([]), true);
  });

  it("retorna true si todos los IDs son válidos", () => {
    strictEqual(areValidIds(["bci", "santander-debit", "falabella"]), true);
  });

  it("retorna false si al menos un ID es inválido", () => {
    strictEqual(areValidIds(["bci", "invalid;id", "falabella"]), false);
  });
});
