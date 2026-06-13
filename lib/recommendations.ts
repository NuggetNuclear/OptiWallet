import type { ApiRecommendation } from "./api-client";

/**
 * Calcula el ahorro en pesos (CLP) para una promoción dada.
 *
 * @param amount Monto total de la compra.
 * @param discount Porcentaje de descuento (1-100).
 * @param cap Tope máximo de descuento en CLP (null si no tiene).
 * @param minPurchase Compra mínima requerida en CLP (null si no tiene).
 * @returns El ahorro calculado en pesos.
 */
export function calculateSavings(
  amount: number,
  discount: number,
  cap: number | null,
  minPurchase: number | null
): number {
  if (amount <= 0) return 0;
  if (minPurchase !== null && amount < minPurchase) return 0;

  const potentialSavings = Math.round((amount * discount) / 100);
  if (cap !== null) {
    return Math.min(potentialSavings, cap);
  }
  return potentialSavings;
}

/**
 * Ordena y prioriza las recomendaciones disponibles.
 *
 * Si no se proporciona un monto, se ordenan por mayor porcentaje de descuento (excluyentes estándar).
 * Si se proporciona un monto, se calcula el ahorro real para cada una (considerando topes
 * y mínimos de compra) y se ordenan por mayor ahorro en pesos.
 *
 * @param recs Lista de recomendaciones aplicables.
 * @param amount Monto de compra opcional.
 * @returns Lista de recomendaciones ordenadas.
 */
export function rankRecommendations(
  recs: ApiRecommendation[],
  amount?: number
): ApiRecommendation[] {
  if (amount === undefined || amount <= 0) {
    return [...recs].sort((a, b) => b.discount - a.discount);
  }

  return [...recs].sort((a, b) => {
    const savingsA = calculateSavings(amount, a.discount, a.cap, a.min_purchase);
    const savingsB = calculateSavings(amount, b.discount, b.cap, b.min_purchase);

    if (savingsB !== savingsA) {
      return savingsB - savingsA;
    }
    // Si el ahorro en pesos es el mismo, prioriza la de mayor porcentaje
    return b.discount - a.discount;
  });
}

export interface StackedResult {
  totalSavings: number;
  breakdown: {
    promotionId: string;
    savings: number;
  }[];
}

/**
 * Calcula el ahorro acumulado al aplicar múltiples promociones apilables de forma sucesiva.
 * El descuento posterior se aplica sobre el monto restante después del descuento anterior.
 *
 * @param promos Lista de promociones apilables.
 * @param amount Monto de compra inicial.
 * @returns Resultado con el ahorro total y el desglose de cada promoción aplicada.
 */
export function calculateStackedSavings(
  promos: ApiRecommendation[],
  amount: number
): StackedResult {
  if (amount <= 0 || promos.length === 0) {
    return { totalSavings: 0, breakdown: [] };
  }

  let currentAmount = amount;
  const breakdown: { promotionId: string; savings: number }[] = [];
  let totalSavings = 0;

  // Aplicar las promociones empezando por la de mayor descuento para maximizar beneficio
  const sorted = [...promos].sort((a, b) => b.discount - a.discount);

  for (const promo of sorted) {
    const savings = calculateSavings(
      currentAmount,
      promo.discount,
      promo.cap,
      promo.min_purchase
    );

    if (savings > 0) {
      totalSavings += savings;
      breakdown.push({
        promotionId: promo.promotion_id,
        savings,
      });
      currentAmount -= savings;
    }
  }

  return { totalSavings, breakdown };
}
