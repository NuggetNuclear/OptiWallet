import { describe, it } from "node:test";
import { strictEqual } from "node:assert";
import { isValidId, areValidIds } from "../lib/validate.ts";

// IDs validos: [A-Za-z0-9_.-]{1,64}
// Todo lo demas se rechaza antes de llegar a la DB.

// ─────────────────────────────── slugs validos ────────────────────────────────

describe("isValidId — slugs validos", () => {
  it("letras minusculas", () => strictEqual(isValidId("bci"), true));
  it("letras mayusculas", () => strictEqual(isValidId("BCI"), true));
  it("solo digitos", () => strictEqual(isValidId("12345"), true));
  it("guion medio", () => strictEqual(isValidId("santander-credit"), true));
  it("guion bajo", () => strictEqual(isValidId("comida_rapida"), true));
  it("punto", () => strictEqual(isValidId("copec.2026"), true));
  it("combinacion: letras + numeros + guion + guion bajo + punto", () => {
    strictEqual(isValidId("copec_all.2026-v1"), true);
  });
  it("longitud 1 (minimo)", () => strictEqual(isValidId("a"), true));
  it("longitud 64 (maximo)", () => strictEqual(isValidId("a".repeat(64)), true));
});

// ───────────────────────────── rechazo: longitud ──────────────────────────────

describe("isValidId — rechazo por longitud", () => {
  it("cadena vacia -> false", () => strictEqual(isValidId(""), false));
  it("longitud 65 -> false", () => strictEqual(isValidId("a".repeat(65)), false));
});

// ────────────────────────────── rechazo: espacios ────────────────────────────

describe("isValidId — rechazo de espacios y control", () => {
  it("espacio interno", () => strictEqual(isValidId("bco chile"), false));
  it("espacio al inicio", () => strictEqual(isValidId(" santander"), false));
  it("espacio al final", () => strictEqual(isValidId("ripley "), false));
  it("tab", () => strictEqual(isValidId("bci\t"), false));
  it("salto de linea", () => strictEqual(isValidId("bci\n"), false));
});

// ─────────────────── rechazo: inyeccion y caracteres peligrosos ──────────────

describe("isValidId — rechazo de caracteres peligrosos", () => {
  it("punto y coma (SQL injection)", () => strictEqual(isValidId("bci;DROP TABLE banks"), false));
  it("comilla simple (SQL)", () => strictEqual(isValidId("copec' OR '1'='1"), false));
  it("tag HTML (XSS)", () => strictEqual(isValidId("<script>alert(1)</script>"), false));
  it("signo menor / mayor", () => {
    strictEqual(isValidId("<hack"), false);
    strictEqual(isValidId("hack>"), false);
  });
  it("almohadilla (fragment)", () => strictEqual(isValidId("ripley#deals"), false));
  it("interrogacion (query string)", () => strictEqual(isValidId("bci?type=credit"), false));
  it("ampersand", () => strictEqual(isValidId("banco&otro"), false));
  it("barra forward (path traversal)", () => strictEqual(isValidId("../../etc/passwd"), false));
  it("barra backward (Windows path)", () => strictEqual(isValidId("bci\\credit"), false));
  it("arroba", () => strictEqual(isValidId("user@bank"), false));
  it("porcentaje (URL encoding)", () => strictEqual(isValidId("%20"), false));
  it("signo mas", () => strictEqual(isValidId("banco+credit"), false));
  it("parentesis", () => strictEqual(isValidId("promo(2026)"), false));
  it("signo igual", () => strictEqual(isValidId("key=value"), false));
  it("exclamacion", () => strictEqual(isValidId("banco!"), false));
  it("asterisco", () => strictEqual(isValidId("promo*"), false));
  it("llaves", () => strictEqual(isValidId("{id}"), false));
  it("corchetes", () => strictEqual(isValidId("[id]"), false));
});

// ─────────────────── rechazo: unicode, acentos y emoji ───────────────────────

describe("isValidId — rechazo de unicode y acentos", () => {
  it("enie (espanol)", () => strictEqual(isValidId("espana"), true)); // sin tilde -> valido
  it("n con tilde -> rechaza", () => strictEqual(isValidId("españa"), false));
  it("vocal acentuada", () => strictEqual(isValidId("crédito"), false));
  it("emoji", () => strictEqual(isValidId("banco🏦"), false));
  it("chino", () => strictEqual(isValidId("銀行"), false));
});

// ───────────────────────── areValidIds (validacion grupal) ────────────────────

describe("areValidIds — validacion grupal", () => {
  it("array vacio -> true", () => strictEqual(areValidIds([]), true));
  it("todos validos -> true", () => {
    strictEqual(areValidIds(["bci", "santander-debit", "falabella.2026"]), true);
  });
  it("un ID invalido en medio -> false", () => {
    strictEqual(areValidIds(["bci", "invalid;id", "falabella"]), false);
  });
  it("un ID invalido al final -> false", () => {
    strictEqual(areValidIds(["bci", "santander", "hack<>"]), false);
  });
  it("un ID vacio en la lista -> false", () => {
    strictEqual(areValidIds(["bci", "", "falabella"]), false);
  });
  it("un ID demasiado largo -> false", () => {
    strictEqual(areValidIds(["bci", "a".repeat(65)]), false);
  });
  it("array de un elemento valido -> true", () => {
    strictEqual(areValidIds(["santander-credit"]), true);
  });
  it("array de un elemento invalido -> false", () => {
    strictEqual(areValidIds(["banco malo!"]), false);
  });
});
