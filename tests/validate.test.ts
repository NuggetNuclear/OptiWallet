import { describe, it } from "node:test";
import { strictEqual } from "node:assert";
import {
  isValidId,
  areValidIds,
  isValidCardTypes,
  isValidCardIds,
  isValidDaysOfWeek,
  isNonNegativeIntOrNull,
  isValidDateOrNull,
  isValidDiscountConfig,
  isValidHttpUrl,
  isValidReportReason,
} from "../lib/validate.ts";

// IDs validos: [A-Za-z0-9_.-]{1,64}
// Todo lo demas se rechaza antes de llegar a la DB.

describe("isValidId — slugs validos", () => {
  it("letras minusculas", () => strictEqual(isValidId("bci"), true));
  it("letras mayusculas", () => strictEqual(isValidId("BCI"), true));
  it("solo digitos", () => strictEqual(isValidId("12345"), true));
  it("guion medio", () => strictEqual(isValidId("santander-credit"), true));
  it("guion bajo", () => strictEqual(isValidId("comida_rapida"), true));
  it("punto", () => strictEqual(isValidId("copec.2026"), true));
  it("combinacion", () => strictEqual(isValidId("copec_all.2026-v1"), true));
  it("longitud 1", () => strictEqual(isValidId("a"), true));
  it("longitud 64", () => strictEqual(isValidId("a".repeat(64)), true));
});

describe("isValidId — rechazo por longitud", () => {
  it("cadena vacia -> false", () => strictEqual(isValidId(""), false));
  it("longitud 65 -> false", () => strictEqual(isValidId("a".repeat(65)), false));
});

describe("isValidId — rechazo de espacios y control", () => {
  it("espacio interno", () => strictEqual(isValidId("bco chile"), false));
  it("tab", () => strictEqual(isValidId("bci\t"), false));
  it("salto de linea", () => strictEqual(isValidId("bci\n"), false));
});

describe("isValidId — rechazo de caracteres peligrosos", () => {
  it("punto y coma", () => strictEqual(isValidId("bci;DROP TABLE banks"), false));
  it("comilla simple", () => strictEqual(isValidId("copec' OR '1'='1"), false));
  it("tag HTML", () => strictEqual(isValidId("<script>alert(1)</script>"), false));
  it("barra forward", () => strictEqual(isValidId("../../etc/passwd"), false));
});

describe("isValidId — rechazo de unicode y acentos", () => {
  it("sin tilde -> valido", () => strictEqual(isValidId("espana"), true));
  it("n con tilde -> rechaza", () => strictEqual(isValidId("españa"), false));
  it("emoji", () => strictEqual(isValidId("banco🏦"), false));
});

describe("areValidIds — validacion grupal", () => {
  it("array vacio -> true", () => strictEqual(areValidIds([]), true));
  it("todos validos -> true", () => strictEqual(areValidIds(["bci", "santander-debit", "falabella.2026"]), true));
  it("uno invalido -> false", () => strictEqual(areValidIds(["bci", "invalid;id"]), false));
  it("uno vacio -> false", () => strictEqual(areValidIds(["bci", ""]), false));
});

describe("isValidCardTypes — writes de promociones", () => {
  it("['credit'] -> true", () => strictEqual(isValidCardTypes(["credit"]), true));
  it("['credit','debit'] -> true", () => strictEqual(isValidCardTypes(["credit", "debit"]), true));
  it("['prepaid'] -> true", () => strictEqual(isValidCardTypes(["prepaid"]), true));
  it("['credit','debit','prepaid'] -> true", () => strictEqual(isValidCardTypes(["credit", "debit", "prepaid"]), true));
  it("array vacio -> false", () => strictEqual(isValidCardTypes([]), false));
  it("valor desconocido -> false", () => strictEqual(isValidCardTypes(["giftcard"]), false));
  it("no-array -> false", () => strictEqual(isValidCardTypes("credit"), false));
  it("null -> false", () => strictEqual(isValidCardTypes(null), false));
});

describe("isValidCardIds — restriccion de tarjeta unica", () => {
  it("array vacio -> true (no restringida a tarjetas especificas)", () => {
    strictEqual(isValidCardIds([]), true);
  });
  it("ids validos -> true", () => {
    strictEqual(isValidCardIds(["bci-credit", "santander-visa.2026"]), true);
  });
  it("un id invalido (caracteres peligrosos) -> false", () => {
    strictEqual(isValidCardIds(["bci-credit", "drop;table"]), false);
  });
  it("elemento no-string (numero) -> false", () => {
    strictEqual(isValidCardIds(["bci-credit", 123]), false);
  });
  it("id vacio -> false", () => strictEqual(isValidCardIds([""]), false));
  it("no-array -> false", () => strictEqual(isValidCardIds("bci-credit"), false));
  it("null -> false", () => strictEqual(isValidCardIds(null), false));
});

describe("isValidDaysOfWeek — 0-6", () => {
  it("array vacio -> true", () => strictEqual(isValidDaysOfWeek([]), true));
  it("[0..6] -> true", () => strictEqual(isValidDaysOfWeek([0, 1, 2, 3, 4, 5, 6]), true));
  it("7 fuera de rango -> false", () => strictEqual(isValidDaysOfWeek([7]), false));
  it("negativo -> false", () => strictEqual(isValidDaysOfWeek([-1]), false));
  it("no entero -> false", () => strictEqual(isValidDaysOfWeek([1.5]), false));
  it("no-array -> false", () => strictEqual(isValidDaysOfWeek(3), false));
});

describe("isNonNegativeIntOrNull — cap / min_purchase", () => {
  it("null -> true", () => strictEqual(isNonNegativeIntOrNull(null), true));
  it("undefined -> true", () => strictEqual(isNonNegativeIntOrNull(undefined), true));
  it("0 -> true", () => strictEqual(isNonNegativeIntOrNull(0), true));
  it("12500 -> true", () => strictEqual(isNonNegativeIntOrNull(12500), true));
  it("negativo -> false", () => strictEqual(isNonNegativeIntOrNull(-1), false));
  it("decimal -> false", () => strictEqual(isNonNegativeIntOrNull(10.5), false));
  it("string -> false", () => strictEqual(isNonNegativeIntOrNull("100"), false));
});

describe("isValidDateOrNull — fechas de promociones", () => {
  it("null -> true", () => strictEqual(isValidDateOrNull(null), true));
  it("undefined -> true", () => strictEqual(isValidDateOrNull(undefined), true));
  it("2026-12-31 -> true", () => strictEqual(isValidDateOrNull("2026-12-31"), true));
  it("9999-99-99 -> false", () => strictEqual(isValidDateOrNull("9999-99-99"), false));
  it("formato malo -> false", () => strictEqual(isValidDateOrNull("31/12/2026"), false));
  it("numero -> false", () => strictEqual(isValidDateOrNull(20261231), false));
});

describe("isValidDiscountConfig — XOR porcentaje vs por-unidad", () => {
  it("solo porcentaje valido (1-100) -> true", () => {
    strictEqual(isValidDiscountConfig({ discount: 15 }), true);
  });
  it("porcentaje en el borde 1 -> true", () => {
    strictEqual(isValidDiscountConfig({ discount: 1 }), true);
  });
  it("porcentaje en el borde 100 -> true", () => {
    strictEqual(isValidDiscountConfig({ discount: 100 }), true);
  });
  it("porcentaje 0 (fuera de rango) -> false", () => {
    strictEqual(isValidDiscountConfig({ discount: 0 }), false);
  });
  it("porcentaje 101 (fuera de rango) -> false", () => {
    strictEqual(isValidDiscountConfig({ discount: 101 }), false);
  });
  it("solo por-unidad valido (liter) -> true", () => {
    strictEqual(isValidDiscountConfig({ discount_per_unit: 100, discount_unit: "liter" }), true);
  });
  it("por-unidad con unidad desconocida -> false", () => {
    strictEqual(isValidDiscountConfig({ discount_per_unit: 100, discount_unit: "kg" }), false);
  });
  it("por-unidad con valor 0 -> false (debe ser > 0)", () => {
    strictEqual(isValidDiscountConfig({ discount_per_unit: 0, discount_unit: "liter" }), false);
  });
  it("por-unidad sin unidad -> false", () => {
    strictEqual(isValidDiscountConfig({ discount_per_unit: 100 }), false);
  });
  it("por-unidad decimal -> false (debe ser entero)", () => {
    strictEqual(isValidDiscountConfig({ discount_per_unit: 10.5, discount_unit: "liter" }), false);
  });
  it("ambos a la vez -> false (no es exclusivo)", () => {
    strictEqual(
      isValidDiscountConfig({ discount: 15, discount_per_unit: 100, discount_unit: "liter" }),
      false
    );
  });
  it("ninguno -> false (al menos uno requerido)", () => {
    strictEqual(isValidDiscountConfig({}), false);
  });
});

describe("isValidHttpUrl — source debe ser URL http(s)", () => {
  it("https válida -> true", () => strictEqual(isValidHttpUrl("https://banco.cl/promo"), true));
  it("http válida -> true", () => strictEqual(isValidHttpUrl("http://banco.cl/promo"), true));
  it("javascript: -> false (vector XSS)", () => strictEqual(isValidHttpUrl("javascript:alert(1)"), false));
  it("data: -> false", () => strictEqual(isValidHttpUrl("data:text/html,<script>alert(1)</script>"), false));
  it("string vacío -> false", () => strictEqual(isValidHttpUrl(""), false));
  it("texto plano no-URL -> false", () => strictEqual(isValidHttpUrl("solo texto"), false));
  it("no-string -> false", () => strictEqual(isValidHttpUrl(null), false));
});

describe("isValidReportReason — motivos de reporte permitidos", () => {
  it("expired -> true", () => strictEqual(isValidReportReason("expired"), true));
  it("wrong_discount -> true", () => strictEqual(isValidReportReason("wrong_discount"), true));
  it("not_found -> true", () => strictEqual(isValidReportReason("not_found"), true));
  it("other -> true", () => strictEqual(isValidReportReason("other"), true));
  it("motivo desconocido -> false", () => strictEqual(isValidReportReason("spam"), false));
  it("null -> false", () => strictEqual(isValidReportReason(null), false));
  it("string vacío -> false", () => strictEqual(isValidReportReason(""), false));
});
