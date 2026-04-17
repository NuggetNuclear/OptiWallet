import type { Card, Merchant, Promotion, Recommendation } from "@/lib/types";
import { getCard } from "@/lib/data/cards";
import { getMerchant } from "@/lib/data/merchants";
import { PROMOTIONS } from "@/lib/data/promotions";

export interface RecommendationInput {
  cardIds: string[]; // tarjetas que tiene el usuario
  merchantId?: string; // si se filtra por un comercio específico
  date: Date; // fecha para evaluar vigencia
  amount?: number; // monto a pagar, para calcular ahorro real con tope
}

/**
 * Devuelve las promociones aplicables ordenadas por mayor ahorro.
 * Si se provee `amount`, el ranking considera el tope de cada promo.
 * Si no, se ordena por % de descuento.
 *
 * Esta función es pura: mismos inputs → mismos outputs. Fácil de testear
 * y de mover a un endpoint en Fase 1.3 sin tocar nada.
 */
export function getRecommendations(input: RecommendationInput): Recommendation[] {
  const userCards = input.cardIds
    .map((id) => getCard(id))
    .filter((c): c is Card => !!c);

  if (userCards.length === 0) return [];

  const dayOfWeek = input.date.getDay();
  const isoDate = toISODate(input.date);

  const candidates: Recommendation[] = [];

  for (const promo of PROMOTIONS) {
    // Filtrar por comercio si aplica
    if (input.merchantId && promo.merchantId !== input.merchantId) continue;

    // Vigencia por día de la semana
    if (promo.daysOfWeek.length > 0 && !promo.daysOfWeek.includes(dayOfWeek)) continue;

    // Vigencia por rango de fechas
    if (promo.startDate && isoDate < promo.startDate) continue;
    if (promo.endDate && isoDate > promo.endDate) continue;

    // ¿El usuario tiene alguna tarjeta compatible?
    const matchingCard = userCards.find(
      (c) => c.bankId === promo.bankId && promo.cardTypes.includes(c.type),
    );
    if (!matchingCard) continue;

    const merchant = getMerchant(promo.merchantId);
    if (!merchant) continue;

    candidates.push({
      promotion: promo,
      card: matchingCard,
      merchant,
      estimatedSavings: input.amount
        ? computeSavings(promo, input.amount)
        : undefined,
    });
  }

  // Ranking: si hay monto, por ahorro absoluto. Si no, por % descuento.
  candidates.sort((a, b) => {
    if (input.amount) {
      return (b.estimatedSavings ?? 0) - (a.estimatedSavings ?? 0);
    }
    return b.promotion.discount - a.promotion.discount;
  });

  return candidates;
}

/**
 * Versión filtrada solo para un comercio. Atajo sobre getRecommendations.
 */
export function getRecommendationsForMerchant(
  merchantId: string,
  cardIds: string[],
  date: Date,
  amount?: number,
): Recommendation[] {
  return getRecommendations({ merchantId, cardIds, date, amount });
}

/**
 * Calcula el ahorro real respetando el tope de descuento.
 * Ejemplo: 40% en $50.000 con tope $20.000 → ahorro = min(20.000, 20.000) = $20.000.
 */
export function computeSavings(promotion: Promotion, amount: number): number {
  const raw = Math.round((amount * promotion.discount) / 100);
  if (promotion.cap === null) return raw;
  return Math.min(raw, promotion.cap);
}

/**
 * Agrupa todas las promos activas hoy por comercio,
 * para el feed de "Promos hoy" en la home.
 */
export function getActivePromotionsToday(
  cardIds: string[],
  date: Date,
): Recommendation[] {
  return getRecommendations({ cardIds, date });
}

function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
