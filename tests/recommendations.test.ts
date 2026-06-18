import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert";
import {
  calculateSavings,
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
});
