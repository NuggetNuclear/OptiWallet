import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert";
import {
  calculateSavings,
  calculateSavingsPerUnit,
  calculateSavingsForRec,
  rankRecommendations,
  calculateStackedSavings,
} from "../lib/recommendations.ts";
import type { ApiRecommendation } from "../lib/api-client";

function rec(overrides: Partial<ApiRecommendation> & { promotion_id: string }): ApiRecommendation {
  return {
    discount: 10,
    discount_per_unit: null,
    discount_unit: null,
    stackable: false,
    cap: null,
    min_purchase: null,
    days_of_week: [],
    start_date: null,
    end_date: null,
    modality: "both",
    code: null,
    conditions: null,
    source: "test",
    verified_at: "2026-06-13",
    merchant_id: "merchant",
    merchant_name: "Merchant",
    popularity_prior: 0.5,
    category_id: "cat",
    category_label: "Categoria",
    emoji: "shopping",
    card_id: "card",
    card_name: "Tarjeta",
    card_type: "credit",
    bank_id: "bank",
    ...overrides,
  };
}

// ────────────────────────────── calculateSavings ──────────────────────────────

describe("calculateSavings — logica core", () => {
  it("monto 0 -> ahorro 0", () => strictEqual(calculateSavings(0, 20, null, null), 0));
  it("monto negativo -> ahorro 0", () => strictEqual(calculateSavings(-500, 20, 10000, null), 0));

  it("monto exactamente igual al minimo -> se aplica (borde inclusivo)", () => {
    strictEqual(calculateSavings(20000, 10, null, 20000), 2000);
  });

  it("monto un peso bajo el minimo -> ahorro 0", () => {
    strictEqual(calculateSavings(19999, 10, null, 20000), 0);
  });

  it("sin tope (cap null) retorna descuento completo", () => {
    strictEqual(calculateSavings(100000, 15, null, null), 15000);
  });

  it("aplica el tope cuando el descuento potencial lo supera", () => {
    // 20% de 100.000 = 20.000 -> tope 15.000
    strictEqual(calculateSavings(100000, 20, 15000, null), 15000);
  });

  it("no aplica el tope si el descuento calculado es menor", () => {
    // 20% de 50.000 = 10.000 < tope 15.000
    strictEqual(calculateSavings(50000, 20, 15000, null), 10000);
  });

  it("descuento exactamente igual al tope -> retorna el tope", () => {
    strictEqual(calculateSavings(50000, 10, 5000, null), 5000);
  });

  it("descuento 0% -> ahorro 0 siempre", () => {
    strictEqual(calculateSavings(100000, 0, null, null), 0);
  });

  it("descuento 100% sin tope -> ahorro igual al monto completo", () => {
    strictEqual(calculateSavings(30000, 100, null, null), 30000);
  });

  it("tope 0 -> ahorro 0 aunque haya descuento", () => {
    strictEqual(calculateSavings(100000, 20, 0, null), 0);
  });

  it("redondea decimales (15% de 1.255 -> 188, no 188.25)", () => {
    strictEqual(calculateSavings(1255, 15, null, null), 188);
  });

  it("montos grandes (millones): aplica tope correctamente", () => {
    // 5% de 5.000.000 = 250.000 -> tope 200.000
    strictEqual(calculateSavings(5_000_000, 5, 200_000, null), 200_000);
  });
});

// ───────────────────────── calculateSavingsPerUnit ───────────────────────────
// Promos de "descuento fijo por litro" (bencineras: $X/L al pagar con app).

describe("calculateSavingsPerUnit — descuento por litro", () => {
  it("0 litros -> ahorro 0", () => strictEqual(calculateSavingsPerUnit(0, 100, null), 0));
  it("litros negativos -> ahorro 0", () => strictEqual(calculateSavingsPerUnit(-5, 100, null), 0));

  it("sin tope: ahorro = litros * descuento/L", () => {
    // 40 L a $120/L = 4.800
    strictEqual(calculateSavingsPerUnit(40, 120, null), 4800);
  });

  it("aplica el tope cuando el ahorro lo supera", () => {
    // 100 L a $150/L = 15.000 -> tope 10.000
    strictEqual(calculateSavingsPerUnit(100, 150, 10000), 10000);
  });

  it("no aplica el tope si el ahorro calculado es menor", () => {
    // 20 L a $100/L = 2.000 < tope 5.000
    strictEqual(calculateSavingsPerUnit(20, 100, 5000), 2000);
  });

  it("tope 0 -> ahorro 0 aunque haya descuento por litro", () => {
    strictEqual(calculateSavingsPerUnit(50, 100, 0), 0);
  });

  it("redondea litros fraccionarios (33.3 L a $90/L = 2997)", () => {
    strictEqual(calculateSavingsPerUnit(33.3, 90, null), 2997);
  });
});

// ─────────────────────────── calculateSavingsForRec ──────────────────────────
// Despacha entre promo por-litro (units) y porcentaje (amount) segun los campos.

describe("calculateSavingsForRec — despacho por tipo de promo", () => {
  it("promo por-litro: usa units e ignora amount", () => {
    const r = rec({ promotion_id: "copec", discount: null, discount_per_unit: 100, discount_unit: "liter" });
    // 30 L * $100/L = 3.000
    strictEqual(calculateSavingsForRec(r, 50000, 30), 3000);
  });

  it("promo por-litro sin units -> 0", () => {
    const r = rec({ promotion_id: "copec", discount: null, discount_per_unit: 100, discount_unit: "liter" });
    strictEqual(calculateSavingsForRec(r, 50000), 0);
  });

  it("promo por-litro con units 0 -> 0", () => {
    const r = rec({ promotion_id: "copec", discount: null, discount_per_unit: 100, discount_unit: "liter" });
    strictEqual(calculateSavingsForRec(r, 50000, 0), 0);
  });

  it("promo por-litro respeta el tope", () => {
    const r = rec({ promotion_id: "copec", discount: null, discount_per_unit: 200, discount_unit: "liter", cap: 5000 });
    // 50 L * $200 = 10.000 -> tope 5.000
    strictEqual(calculateSavingsForRec(r, 0, 50), 5000);
  });

  it("promo porcentaje: usa amount", () => {
    const r = rec({ promotion_id: "banco", discount: 15 });
    strictEqual(calculateSavingsForRec(r, 100000), 15000);
  });

  it("promo porcentaje sin amount -> 0", () => {
    const r = rec({ promotion_id: "banco", discount: 15 });
    strictEqual(calculateSavingsForRec(r), 0);
  });

  it("promo porcentaje con amount 0 -> 0", () => {
    const r = rec({ promotion_id: "banco", discount: 15 });
    strictEqual(calculateSavingsForRec(r, 0), 0);
  });

  it("promo porcentaje respeta min_purchase", () => {
    const r = rec({ promotion_id: "banco", discount: 50, min_purchase: 100000 });
    strictEqual(calculateSavingsForRec(r, 50000), 0);
  });

  it("promo sin discount ni discount_per_unit -> 0 (sin tipo)", () => {
    const r = rec({ promotion_id: "rara", discount: null, discount_per_unit: null, discount_unit: null });
    strictEqual(calculateSavingsForRec(r, 100000, 50), 0);
  });

  it("discount_per_unit presente pero unit != liter -> cae a la rama de porcentaje", () => {
    // discount_unit desconocido: no entra en la rama por-litro; usa discount si existe
    const r = rec({ promotion_id: "hibrida", discount: 10, discount_per_unit: 100, discount_unit: "kg" });
    strictEqual(calculateSavingsForRec(r, 100000), 10000);
  });
});

// ─────────────────────────── rankRecommendations ─────────────────────────────

describe("rankRecommendations — excluyentes", () => {
  const promoA = rec({ promotion_id: "a-30-cap5k",  discount: 30, cap: 5_000  });
  const promoB = rec({ promotion_id: "b-20-cap10k", discount: 20, cap: 10_000 });
  const promoC = rec({ promotion_id: "c-15-nocap",  discount: 15, cap: null   });

  it("lista vacia -> lista vacia", () => deepStrictEqual(rankRecommendations([]), []));

  it("lista de 1 elemento -> la devuelve sin cambios", () => {
    const result = rankRecommendations([promoB]);
    strictEqual(result.length, 1);
    strictEqual(result[0].promotion_id, "b-20-cap10k");
  });

  it("sin monto: ordena por mayor % de descuento", () => {
    const result = rankRecommendations([promoC, promoB, promoA]);
    strictEqual(result[0].promotion_id, "a-30-cap5k");
    strictEqual(result[1].promotion_id, "b-20-cap10k");
    strictEqual(result[2].promotion_id, "c-15-nocap");
  });

  it("sin monto y mismo %: desempata por mayor tope (cap)", () => {
    const p1 = rec({ promotion_id: "p1", discount: 25, cap: 5000 });
    const p2 = rec({ promotion_id: "p2", discount: 25, cap: 50000 });
    const p3 = rec({ promotion_id: "p3", discount: 25, cap: null });
    const result = rankRecommendations([p1, p2, p3]);
    strictEqual(result[0].promotion_id, "p3"); // sin tope gana
    strictEqual(result[1].promotion_id, "p2"); // tope 50k
    strictEqual(result[2].promotion_id, "p1"); // tope 5k
  });

  it("monto 0: se comporta como sin monto (ordena por %)", () => {
    const result = rankRecommendations([promoC, promoA], 0);
    strictEqual(result[0].promotion_id, "a-30-cap5k");
  });

  it("monto bajo donde todos quedan bajo su tope: gana el mayor %", () => {
    // 10.000: A ahorra 3.000 (30%), B ahorra 2.000 (20%)
    const result = rankRecommendations([promoB, promoA], 10000);
    strictEqual(result[0].promotion_id, "a-30-cap5k");
  });

  it("monto alto donde el tope activa: gana el mayor ahorro real en CLP", () => {
    // 40.000: A -> tope 5.000; B -> 8.000 (bajo tope). Ganador: B
    const result = rankRecommendations([promoA, promoB], 40000);
    strictEqual(result[0].promotion_id, "b-20-cap10k");
    strictEqual(result[1].promotion_id, "a-30-cap5k");
  });

  it("desempate por %: mismo ahorro CLP -> gana el mayor porcentaje", () => {
    // 25.000: A -> tope 5.000; B -> 5.000. Empate -> A gana (30% > 20%)
    const result = rankRecommendations([promoB, promoA], 25000);
    strictEqual(result[0].promotion_id, "a-30-cap5k");
    strictEqual(result[1].promotion_id, "b-20-cap10k");
  });

  it("promo que no alcanza su min_purchase -> savings 0, va al final", () => {
    const promoMinimo = rec({ promotion_id: "d-50-min100k", discount: 50, min_purchase: 100_000 });
    const result = rankRecommendations([promoMinimo, promoA], 10000);
    strictEqual(result[0].promotion_id, "a-30-cap5k");
    strictEqual(result[1].promotion_id, "d-50-min100k");
  });

  it("todas con savings 0: ordena por % como fallback", () => {
    const x30 = rec({ promotion_id: "x-30", discount: 30, min_purchase: 999_999 });
    const x10 = rec({ promotion_id: "x-10", discount: 10, min_purchase: 999_999 });
    const result = rankRecommendations([x10, x30], 1000);
    strictEqual(result[0].promotion_id, "x-30");
  });

  it("no muta el array original", () => {
    const lista = [promoC, promoA, promoB];
    const primerOriginal = lista[0].promotion_id;
    rankRecommendations(lista, 40000);
    strictEqual(lista[0].promotion_id, primerOriginal);
  });
});

describe("rankRecommendations — contexto por litros y promos mixtas", () => {
  const litro100 = rec({ promotion_id: "l-100", discount: null, discount_per_unit: 100, discount_unit: "liter" });
  const litro150 = rec({ promotion_id: "l-150", discount: null, discount_per_unit: 150, discount_unit: "liter" });

  it("sin contexto: ordena promos por-litro por mayor descuento/L", () => {
    const result = rankRecommendations([litro100, litro150]);
    strictEqual(result[0].promotion_id, "l-150");
    strictEqual(result[1].promotion_id, "l-100");
  });

  it("con litros: ordena por ahorro real en CLP", () => {
    // 40 L: l-150 -> 6.000 ; l-100 -> 4.000
    const result = rankRecommendations([litro100, litro150], undefined, 40);
    strictEqual(result[0].promotion_id, "l-150");
    strictEqual(result[1].promotion_id, "l-100");
  });

  it("litros activan el contexto aunque amount sea undefined", () => {
    const pct = rec({ promotion_id: "pct-50", discount: 50 });
    // Con 40 L: pct-50 sin amount -> 0 ; l-100 -> 4.000. Gana l-100
    const result = rankRecommendations([pct, litro100], undefined, 40);
    strictEqual(result[0].promotion_id, "l-100");
    strictEqual(result[1].promotion_id, "pct-50");
  });

  it("desempate por valor bruto cuando el ahorro CLP empata", () => {
    // 10 L: l-150 -> 1.500 con tope 1.500 ; l-100 sin tope -> 1.000. distinto, no empata.
    // Forzamos empate con tope comun:
    const a = rec({ promotion_id: "a", discount: null, discount_per_unit: 100, discount_unit: "liter", cap: 1000 });
    const b = rec({ promotion_id: "b", discount: null, discount_per_unit: 150, discount_unit: "liter", cap: 1000 });
    // 20 L: ambas topan en 1.000 -> empate -> gana mayor descuento/L (b)
    const result = rankRecommendations([a, b], undefined, 20);
    strictEqual(result[0].promotion_id, "b");
  });
});

// ─────────────────────────── calculateStackedSavings ─────────────────────────

describe("calculateStackedSavings — apilables", () => {
  const banco = rec({ promotion_id: "banco-20-cap10k", discount: 20, cap: 10_000, stackable: true });
  const cupon = rec({ promotion_id: "cupon-10-min10k", discount: 10, cap: 5_000, min_purchase: 10_000, stackable: true });

  it("amount 0 -> sin ahorro", () => {
    deepStrictEqual(calculateStackedSavings([banco], 0), { totalSavings: 0, breakdown: [] });
  });

  it("promos vacias -> sin ahorro", () => {
    deepStrictEqual(calculateStackedSavings([], 20000), { totalSavings: 0, breakdown: [] });
  });

  it("una sola promo -> ahorro directo sin cascada", () => {
    // 20% de 30.000 = 6.000 (bajo tope 10k)
    const result = calculateStackedSavings([banco], 30000);
    strictEqual(result.totalSavings, 6000);
    strictEqual(result.breakdown.length, 1);
    deepStrictEqual(result.breakdown[0], { promotionId: "banco-20-cap10k", savings: 6000 });
  });

  it("aplica mayor % primero y calcula sobre el remanente (cascada correcta)", () => {
    // 20.000: banco(20%) -> 4.000 -> remanente 16.000; cupon(10% de 16k=1.600) -> total 5.600
    const result = calculateStackedSavings([cupon, banco], 20000);
    strictEqual(result.totalSavings, 5600);
    strictEqual(result.breakdown.length, 2);
    deepStrictEqual(result.breakdown[0], { promotionId: "banco-20-cap10k", savings: 4000 });
    deepStrictEqual(result.breakdown[1], { promotionId: "cupon-10-min10k", savings: 1600 });
  });

  it("promo excluida por min_purchase sobre remanente no aparece en breakdown", () => {
    // 11.000: banco -> 2.200 -> remanente 8.800 < min_purchase cupon (10.000)
    const result = calculateStackedSavings([cupon, banco], 11000);
    strictEqual(result.totalSavings, 2200);
    strictEqual(result.breakdown.length, 1);
    strictEqual(result.breakdown[0].promotionId, "banco-20-cap10k");
  });

  it("aplica tope correctamente dentro de la cascada", () => {
    const capChico = rec({ promotion_id: "cap-chico", discount: 50, cap: 3000, stackable: true });
    // 20.000: banco (20%) -> 4.000 (remanente 16.000); capChico (50% de 16k=8k, tope 3.000) -> 7.000
    const result = calculateStackedSavings([capChico, banco], 20000);
    strictEqual(result.totalSavings, 7000);
    deepStrictEqual(result.breakdown[0], { promotionId: "banco-20-cap10k", savings: 4000 });
    deepStrictEqual(result.breakdown[1], { promotionId: "cap-chico", savings: 3000 });
  });

  it("promo con tope=0 -> savings=0, no aparece en breakdown", () => {
    const sinAhorro = rec({ promotion_id: "tope-cero", discount: 50, cap: 0, stackable: true });
    const result = calculateStackedSavings([sinAhorro, banco], 10000);
    strictEqual(result.breakdown.length, 1);
    strictEqual(result.breakdown[0].promotionId, "banco-20-cap10k");
    strictEqual(result.totalSavings, 2000);
  });

  it("todas las promos excluidas -> { totalSavings: 0, breakdown: [] }", () => {
    const imposible = rec({ promotion_id: "imposible", discount: 20, min_purchase: 999_999, stackable: true });
    deepStrictEqual(calculateStackedSavings([imposible], 1000), { totalSavings: 0, breakdown: [] });
  });

  it("no muta el array original de promos", () => {
    const promos = [cupon, banco];
    const primerOriginal = promos[0].promotion_id;
    calculateStackedSavings(promos, 20000);
    strictEqual(promos[0].promotion_id, primerOriginal);
  });

  it("ignora promos no apilables (stackable=false)", () => {
    const noStack = rec({ promotion_id: "no-stack", discount: 30, stackable: false });
    deepStrictEqual(calculateStackedSavings([noStack], 20000), { totalSavings: 0, breakdown: [] });
  });

  it("promo por-litro no reduce el monto base de las de porcentaje", () => {
    // banco 20% sobre 20.000 = 4.000 (remanente 16.000).
    // litro $100/L * 30 L = 3.000, NO descuenta del monto base (es combustible).
    const litro = rec({ promotion_id: "litro", discount: null, discount_per_unit: 100, discount_unit: "liter", stackable: true });
    const result = calculateStackedSavings([banco, litro], 20000, 30);
    strictEqual(result.totalSavings, 7000);
    strictEqual(result.breakdown.length, 2);
    const litroEntry = result.breakdown.find((b) => b.promotionId === "litro");
    deepStrictEqual(litroEntry, { promotionId: "litro", savings: 3000 });
  });
});
