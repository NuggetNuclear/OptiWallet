import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert";
import {
  calculateSavings,
  rankRecommendations,
  calculateStackedSavings,
} from "./recommendations.ts";
import type { ApiRecommendation } from "./api-client";

// Helper para crear recomendaciones mock fácilmente
function createMockRec(overrides: Partial<ApiRecommendation>): ApiRecommendation {
  return {
    promotion_id: "mock-promo",
    discount: 10,
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
    merchant_id: "mock-merchant",
    merchant_name: "Mock Merchant",
    category_id: "mock-cat",
    category_label: "Mock Category",
    emoji: "🛍️",
    card_id: "mock-card",
    card_name: "Mock Card",
    card_type: "credit",
    bank_id: "mock-bank",
    ...overrides,
  };
}

describe("Lógica de Ahorro y Topes (caps/min_purchase)", () => {
  it("monto menor o igual a cero retorna ahorro cero", () => {
    strictEqual(calculateSavings(0, 20, 10000, null), 0);
    strictEqual(calculateSavings(-500, 20, 10000, null), 0);
  });

  it("monto menor que el mínimo de compra retorna ahorro cero", () => {
    strictEqual(calculateSavings(15000, 20, 10000, 20000), 0);
  });

  it("monto mayor o igual al mínimo de compra calcula ahorro normalmente", () => {
    strictEqual(calculateSavings(25000, 20, 10000, 20000), 5000);
  });

  it("sin tope (cap: null) retorna el descuento total calculado", () => {
    strictEqual(calculateSavings(100000, 15, null, null), 15000);
  });

  it("aplica el tope (cap) cuando el descuento potencial lo supera", () => {
    // 20% de 100.000 es 20.000, pero el tope es 15.000
    strictEqual(calculateSavings(100000, 20, 15000, null), 15000);
  });

  it("no aplica el tope (cap) si el descuento calculado es menor que este", () => {
    // 20% de 50.000 es 10.000, menor que el tope de 15.000
    strictEqual(calculateSavings(50000, 20, 15000, null), 10000);
  });

  it("redondea los decimales del descuento calculado", () => {
    // 15% de 1.255 es 188.25 -> 188
    strictEqual(calculateSavings(1255, 15, null, null), 188);
  });
});

describe("Ordenamiento de Recomendaciones Excluyentes (rankRecommendations)", () => {
  const promoA = createMockRec({
    promotion_id: "promo-30-cap-5k",
    discount: 30,
    cap: 5000,
    card_id: "card-a",
    card_name: "Tarjeta A 30%",
  });

  const promoB = createMockRec({
    promotion_id: "promo-20-cap-10k",
    discount: 20,
    cap: 10000,
    card_id: "card-b",
    card_name: "Tarjeta B 20%",
  });

  const list = [promoB, promoA];

  it("sin monto especificado, ordena por mayor porcentaje de descuento", () => {
    const result = rankRecommendations(list);
    strictEqual(result[0].promotion_id, "promo-30-cap-5k"); // 30% primero
    strictEqual(result[1].promotion_id, "promo-20-cap-10k"); // 20% segundo
  });

  it("para montos bajos, prioriza la tarjeta con mayor porcentaje de descuento", () => {
    // Para compra de $10.000:
    // Tarjeta A (30%): ahorra $3.000 (bajo el tope de 5k)
    // Tarjeta B (20%): ahorra $2.000 (bajo el tope de 10k)
    // Ganador: Tarjeta A
    const result = rankRecommendations(list, 10000);
    strictEqual(result[0].promotion_id, "promo-30-cap-5k");
    strictEqual(result[1].promotion_id, "promo-20-cap-10k");
  });

  it("para montos altos (donde influye el tope), prioriza la tarjeta que genera mayor ahorro real", () => {
    // Para compra de $40.000:
    // Tarjeta A (30%): ahorra $12.000 potenciales, pero tope es $5.000 -> Ahorro = $5.000
    // Tarjeta B (20%): ahorra $8.000 potenciales (bajo el tope de 10k) -> Ahorro = $8.000
    // Ganador: Tarjeta B (a pesar de tener menor porcentaje, ahorra más en pesos)
    const result = rankRecommendations(list, 40000);
    strictEqual(result[0].promotion_id, "promo-20-cap-10k");
    strictEqual(result[1].promotion_id, "promo-30-cap-5k");
  });

  it("si el ahorro en pesos es igual, prioriza la de mayor porcentaje de descuento", () => {
    // Para compra de $25.000:
    // Tarjeta A (30%): 30% de 25k = 7.5k potenciales, tope es 5k -> Ahorro = $5.000
    // Tarjeta B (20%): 20% de 25k = 5.0k potenciales, tope es 10k -> Ahorro = $5.000
    // Ahorros iguales ($5.000), desempata el porcentaje: Tarjeta A (30% > 20%)
    const result = rankRecommendations(list, 25000);
    strictEqual(result[0].promotion_id, "promo-30-cap-5k");
    strictEqual(result[1].promotion_id, "promo-20-cap-10k");
  });
});

describe("Promociones Apilables (calculateStackedSavings)", () => {
  const couponPromo = createMockRec({
    promotion_id: "coupon-10",
    discount: 10,
    cap: 5000,
    min_purchase: 10000,
  });

  const bankPromo = createMockRec({
    promotion_id: "bank-20-cap-10k",
    discount: 20,
    cap: 10000,
  });

  const promos = [couponPromo, bankPromo];

  it("aplica múltiples descuentos apilables sucesivamente sobre el monto remanente", () => {
    // Compra inicial: $20.000
    // 1. Aplica Promo Banco (20%):
    //    Ahorro = 20% de 20.000 = $4.000 (bajo tope 10k)
    //    Monto remanente = $16.000
    // 2. Aplica Cupón Comercio (10%):
    //    Ahorro = 10% de 16.000 = $1.600 (bajo tope 5k, sobre mínimo 10k)
    //    Monto remanente = $14.400
    // Ahorro total = $4.000 + $1.600 = $5.600
    const result = calculateStackedSavings(promos, 20000);

    strictEqual(result.totalSavings, 5600);
    strictEqual(result.breakdown.length, 2);
    deepStrictEqual(result.breakdown[0], { promotionId: "bank-20-cap-10k", savings: 4000 });
    deepStrictEqual(result.breakdown[1], { promotionId: "coupon-10", savings: 1600 });
  });

  it("si el monto remanente cae bajo el mínimo de compra de la segunda promo, esta no se aplica", () => {
    // Compra inicial: $11.000
    // 1. Aplica Promo Banco (20%):
    //    Ahorro = 20% de 11.000 = $2.200 (bajo tope 10k)
    //    Monto remanente = $8.800
    // 2. Intenta aplicar Cupón Comercio (10% con min_purchase 10.000):
    //    Como remanente $8.800 < $10.000 mínimo de compra, no se aplica.
    // Ahorro total = $2.200
    const result = calculateStackedSavings(promos, 11000);

    strictEqual(result.totalSavings, 2200);
    strictEqual(result.breakdown.length, 1);
    deepStrictEqual(result.breakdown[0], { promotionId: "bank-20-cap-10k", savings: 2200 });
  });
});
