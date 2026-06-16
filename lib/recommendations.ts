import type { ApiRecommendation } from "./api-client";

/**
 * Calcula el ahorro en pesos (CLP) para una promoción de tipo porcentaje.
 *
 * @param amount Monto total de la compra en CLP.
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
 * Calcula el ahorro en pesos (CLP) para una promoción de tipo "fijo por litro"
 * (ej. $100/L al pagar con app en bencineras).
 *
 * @param units Cantidad de litros a cargar.
 * @param discountPerUnit Descuento fijo en CLP por litro (ej. 100).
 * @param cap Tope máximo de descuento en CLP (null si no tiene).
 * @returns El ahorro calculado en pesos.
 */
export function calculateSavingsPerUnit(
  units: number,
  discountPerUnit: number,
  cap: number | null
): number {
  if (units <= 0) return 0;
  const savings = Math.round(units * discountPerUnit);
  return cap !== null ? Math.min(savings, cap) : savings;
}

/**
 * Calcula el ahorro de una recomendación dado el contexto del usuario.
 * Usa `units` para promos de tipo por-litro, `amount` para las de porcentaje.
 */
export function calculateSavingsForRec(
  rec: ApiRecommendation,
  amount?: number,
  units?: number
): number {
  if (rec.discount_per_unit !== null && rec.discount_unit === "liter") {
    if (units === undefined || units <= 0) return 0;
    return calculateSavingsPerUnit(units, rec.discount_per_unit, rec.cap);
  }
  if (rec.discount !== null) {
    if (amount === undefined || amount <= 0) return 0;
    const minPurchase = rec.min_purchase;
    return calculateSavings(amount, rec.discount, rec.cap, minPurchase);
  }
  return 0;
}

/**
 * Ordena y prioriza las recomendaciones disponibles.
 *
 * Si no se proporciona contexto, se ordenan por mayor descuento:
 *   - Porcentaje: por el valor del porcentaje.
 *   - Por litro: por el monto por unidad.
 * Si se proporciona monto/litros, se calcula el ahorro real y se ordena por él.
 *
 * @param recs Lista de recomendaciones aplicables.
 * @param amount Monto de compra en CLP (para promos de porcentaje).
 * @param units Litros a cargar (para promos de tipo por litro).
 * @returns Lista de recomendaciones ordenadas.
 */
export function rankRecommendations(
  recs: ApiRecommendation[],
  amount?: number,
  units?: number
): ApiRecommendation[] {
  const hasContext = (amount !== undefined && amount > 0) || (units !== undefined && units > 0);

  if (!hasContext) {
    return [...recs].sort((a, b) => {
      // Comparar usando el valor bruto del descuento (% vs CLP/L se mezclan solo sin contexto)
      const va = a.discount_per_unit ?? a.discount ?? 0;
      const vb = b.discount_per_unit ?? b.discount ?? 0;
      return vb - va;
    });
  }

  return [...recs].sort((a, b) => {
    const savingsA = calculateSavingsForRec(a, amount, units);
    const savingsB = calculateSavingsForRec(b, amount, units);

    if (savingsB !== savingsA) return savingsB - savingsA;
    // Desempate: mayor porcentaje o mayor monto por unidad
    const va = a.discount_per_unit ?? a.discount ?? 0;
    const vb = b.discount_per_unit ?? b.discount ?? 0;
    return vb - va;
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
 * Calcula el ahorro acumulado al aplicar múltiples promociones apilables (stackable=true)
 * de forma sucesiva. El descuento posterior se aplica sobre el monto restante.
 *
 * Solo se incluyen en el cálculo las promociones marcadas como `stackable`.
 *
 * @param promos Lista de recomendaciones (se filtra internamente por stackable).
 * @param amount Monto de compra inicial en CLP.
 * @param units Litros a cargar (para promos de tipo por litro).
 * @returns Resultado con el ahorro total y el desglose por promoción.
 */
export function calculateStackedSavings(
  promos: ApiRecommendation[],
  amount: number,
  units?: number
): StackedResult {
  if (amount <= 0 || promos.length === 0) {
    return { totalSavings: 0, breakdown: [] };
  }

  // Solo promos marcadas como apilables
  const stackable = promos.filter((p) => p.stackable);
  if (stackable.length === 0) return { totalSavings: 0, breakdown: [] };

  let currentAmount = amount;
  const breakdown: { promotionId: string; savings: number }[] = [];
  let totalSavings = 0;

  // Ordenar por mayor ahorro primero para maximizar el beneficio
  const sorted = [...stackable].sort((a, b) => {
    const sa = calculateSavingsForRec(a, currentAmount, units);
    const sb = calculateSavingsForRec(b, currentAmount, units);
    return sb - sa;
  });

  for (const promo of sorted) {
    const savings = calculateSavingsForRec(promo, currentAmount, units);
    if (savings > 0) {
      totalSavings += savings;
      breakdown.push({ promotionId: promo.promotion_id, savings });
      // Las promos de tipo porcentaje reducen el monto base; las de por litro no
      if (promo.discount !== null) {
        currentAmount -= savings;
      }
    }
  }

  return { totalSavings, breakdown };
}
