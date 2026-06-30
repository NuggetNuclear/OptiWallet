import { toISODateLocal } from "./format.ts";

// ──────────────────────────────────────────────────────────────
// API response types (snake_case — match Neon column names)
// ──────────────────────────────────────────────────────────────

export type ApiBank = {
  id:         string;
  name:       string;
  short_name: string | null;
  available:  boolean;
  color:      string | null;
};

export type ApiCard = {
  id:      string;
  bank_id: string;
  name:    string;
  type:    string;
};

export type ApiCategory = {
  id:             string;
  label:          string;
  emoji:          string;
  merchant_count: number;
};

export type ApiMerchant = {
  id:               string;
  name:             string;
  category_id:      string;
  aliases:          string[];
  category_label:   string;
  emoji:            string;
  /** Prior de popularidad 0–1 (cold-start del ranking). DEFAULT 0.5 si el script aún no corrió. */
  popularity_prior: number;
  max_discount:     number | null;
};

export type ApiRecommendation = {
  promotion_id:      string;
  discount:          number | null;
  discount_per_unit: number | null;
  discount_unit:     string | null;
  stackable:         boolean;
  cap:               number | null;
  min_purchase:      number | null;
  days_of_week:      number[];
  start_date:        string | null;
  end_date:          string | null;
  modality:          string;
  code:              string | null;
  conditions:        string | null;
  source:            string;
  verified_at:       string;
  merchant_id:       string;
  merchant_name:     string;
  /** Prior de popularidad 0–1 del comercio (cold-start del ranking). DEFAULT 0.5. */
  popularity_prior:  number;
  category_id:       string;
  category_label:    string;
  emoji:             string;
  card_id:           string;
  card_name:         string;
  card_type:         string;
  bank_id:           string;
};

export type ApiPromotion = {
  id:                string;
  bank_id:           string;
  card_types:        string[];
  /** IDs de tarjetas específicas. Vacío = aplica por card_types (sin restricción). */
  card_ids:          string[];
  /** Nombres de esas tarjetas específicas (derivado en el server). Vacío si no hay restricción. */
  card_names:        string[];
  merchant_id:       string;
  discount:          number | null;
  discount_per_unit: number | null;
  discount_unit:     string | null;
  stackable:         boolean;
  cap:               number | null;
  min_purchase:      number | null;
  days_of_week:      number[];
  start_date:        string | null;
  end_date:          string | null;
  modality:          string;
  code:              string | null;
  conditions:        string | null;
  source:            string;
  verified_at:       string;
  active:            boolean;
  bank_name:         string;
};

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

function buildUrl(path: string, params: Record<string, string | string[]>): string {
  // Use a dummy base for URL construction — we only need the path + query string.
  // This avoids depending on `window.location.origin` which is unavailable in SSR.
  const url = new URL(path, "http://localhost");
  for (const [key, val] of Object.entries(params)) {
    if (Array.isArray(val)) {
      val.forEach((v) => url.searchParams.append(key, v));
    } else if (val) {
      url.searchParams.set(key, val);
    }
  }
  return url.pathname + url.search;
}

// ──────────────────────────────────────────────────────────────
// Fetch functions
// ──────────────────────────────────────────────────────────────

export async function getBanksFromApi(): Promise<ApiBank[]> {
  const res = await fetch("/api/banks");
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export async function getCardsFromApi(bankId?: string): Promise<ApiCard[]> {
  const url = buildUrl("/api/cards", {
    ...(bankId ? { bankId } : {}),
  });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export async function getCategoriesFromApi(): Promise<ApiCategory[]> {
  const res = await fetch("/api/categories");
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export async function getMerchantsFromApi(params?: {
  q?:        string;
  category?: string;
}): Promise<ApiMerchant[]> {
  const url = buildUrl("/api/merchants", {
    ...(params?.q        ? { q:        params.q }        : {}),
    ...(params?.category ? { category: params.category } : {}),
  });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export async function getRecommendationsFromApi(params: {
  cardIds:     string[];
  date:        Date;
  merchantId?: string;
}): Promise<ApiRecommendation[]> {
  const url = buildUrl("/api/recommendations", {
    cardIds:    params.cardIds,
    date:       toISODateLocal(params.date),
    ...(params.merchantId ? { merchantId: params.merchantId } : {}),
  });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export async function getMerchantByIdFromApi(
  merchantId: string,
): Promise<ApiMerchant | null> {
  const res = await fetch(`/api/merchants/${encodeURIComponent(merchantId)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export async function getPromotionsForMerchantFromApi(
  merchantId: string,
): Promise<ApiPromotion[]> {
  const res = await fetch(`/api/promotions/${encodeURIComponent(merchantId)}`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

// ──────────────────────────────────────────────────────────────
// Tracking de eventos de promos (fire-and-forget)
// ──────────────────────────────────────────────────────────────

export type PromoEventType = "view" | "tap";
export type PromoEventLocation = "feed" | "merchant_detail" | "search";

/**
 * Registra una impresión o tap de una promoción en la tabla `promo_events`.
 * Fire-and-forget: nunca lanza errores, no bloquea al caller.
 *
 * @param promotionId  ID de la promo vista/tocada
 * @param merchantId   ID del comercio (denormalizado)
 * @param bankId       ID del banco (denormalizado)
 * @param eventType    'view' o 'tap'
 * @param location     Dónde ocurrió el evento
 * @param sessionId    Hash anónimo de sesión (opcional)
 */
export function logPromoEvent(params: {
  promotionId: string;
  merchantId:  string;
  bankId:      string;
  eventType:   PromoEventType;
  location:    PromoEventLocation;
  sessionId?:  string;
}): void {
  if (typeof window === "undefined") return; // solo cliente
  // Ignoramos la promesa a propósito — fire-and-forget
  fetch("/api/promo-events", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(params),
    // keepalive: true permite que el request sobreviva si la página se cierra
    keepalive: true,
  }).catch(() => {
    // Silencioso — analytics nunca rompe la app
  });
}
