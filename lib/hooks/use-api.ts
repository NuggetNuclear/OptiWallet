"use client";

import { useEffect, useRef, useState } from "react";
import {
  getBanksFromApi,
  getCardsFromApi,
  getCategoriesFromApi,
  getMerchantsFromApi,
  getMerchantByIdFromApi,
  getRecommendationsFromApi,
  getPromotionsForMerchantFromApi,
  type ApiBank,
  type ApiCard,
  type ApiCategory,
  type ApiMerchant,
  type ApiRecommendation,
  type ApiPromotion,
} from "@/lib/api-client";
import { toISODateLocal } from "@/lib/format";

// ──────────────────────────────────────────────────────────────
// Generic result shape
// ──────────────────────────────────────────────────────────────

interface ApiState<T> {
  data: T;
  loading: boolean;
  error: string | null;
}

// ──────────────────────────────────────────────────────────────
// useApiQuery — fetch-on-render compartido por todos los hooks
//
// `loading` se DERIVA comparando la key del último resultado con la key
// actual, en vez de hacer setState síncrono dentro del efecto (patrón que
// React desaconseja por causar renders en cascada —
// react-hooks/set-state-in-effect).
// ──────────────────────────────────────────────────────────────

interface QueryResult<T> {
  key: string;
  data: T;
  error: string | null;
}

function useApiQuery<T>(
  key: string,
  fetcher: () => Promise<T>,
  empty: T,
  { debounceMs = 0, skip = false }: { debounceMs?: number; skip?: boolean } = {},
): ApiState<T> {
  const [result, setResult] = useState<QueryResult<T> | null>(null);

  // Los callers pasan closures nuevas en cada render; las guardamos en un
  // ref para que el efecto dependa solo de `key` (que codifica los params).
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  // Valor "vacío" estable: los callers pasan [] / null literales en cada
  // render; el initial state congela la primera referencia.
  const [stableEmpty] = useState(empty);

  useEffect(() => {
    if (skip) return;
    let cancelled = false;

    const run = () => {
      fetcherRef
        .current()
        .then((data) => {
          if (!cancelled) setResult({ key, data, error: null });
        })
        .catch((err: Error) => {
          if (!cancelled) setResult({ key, data: stableEmpty, error: err.message });
        });
    };

    const timer = debounceMs > 0 ? setTimeout(run, debounceMs) : null;
    if (timer === null) run();

    return () => {
      cancelled = true;
      if (timer !== null) clearTimeout(timer);
    };
  }, [key, skip, debounceMs, stableEmpty]);

  if (skip) {
    return { data: stableEmpty, loading: false, error: null };
  }

  return {
    // Mientras carga una key nueva se mantiene la data anterior; los
    // componentes deciden con `loading` si muestran skeletons.
    data: result !== null ? result.data : stableEmpty,
    loading: result === null || result.key !== key,
    error: result !== null && result.key === key ? result.error : null,
  };
}

// ──────────────────────────────────────────────────────────────
// useBanks — load all banks once
// ──────────────────────────────────────────────────────────────

export function useBanks(): ApiState<ApiBank[]> {
  return useApiQuery<ApiBank[]>("banks", getBanksFromApi, []);
}

// ──────────────────────────────────────────────────────────────
// useCards — load all cards once
// ──────────────────────────────────────────────────────────────

export function useCards(): ApiState<ApiCard[]> {
  return useApiQuery<ApiCard[]>("cards", () => getCardsFromApi(), []);
}

// ──────────────────────────────────────────────────────────────
// useCategories — load all merchant categories once
// ──────────────────────────────────────────────────────────────

export function useCategories(): ApiState<ApiCategory[]> {
  return useApiQuery<ApiCategory[]>("categories", getCategoriesFromApi, []);
}

// ──────────────────────────────────────────────────────────────
// useMerchants — search merchants with debounce
// ──────────────────────────────────────────────────────────────

export function useMerchants(
  query: string,
  category: string | null,
): ApiState<ApiMerchant[]> {
  return useApiQuery<ApiMerchant[]>(
    `merchants:${query}:${category ?? ""}`,
    () =>
      getMerchantsFromApi({
        q: query || undefined,
        category: category || undefined,
      }),
    [],
    { debounceMs: query ? 200 : 0 }, // debounce only on text input
  );
}

// ──────────────────────────────────────────────────────────────
// useRecommendations — fetch recommendations for given cards/date
// ──────────────────────────────────────────────────────────────

export function useRecommendations(
  cardIds: string[],
  date: Date,
  merchantId?: string,
): ApiState<ApiRecommendation[]> {
  const dateKey = toISODateLocal(date);
  return useApiQuery<ApiRecommendation[]>(
    `recommendations:${cardIds.join(",")}:${dateKey}:${merchantId ?? ""}`,
    () => getRecommendationsFromApi({ cardIds, date, merchantId }),
    [],
    { skip: cardIds.length === 0 },
  );
}

// ──────────────────────────────────────────────────────────────
// usePromotions — fetch all promotions for a merchant
// ──────────────────────────────────────────────────────────────

export function usePromotions(merchantId: string): ApiState<ApiPromotion[]> {
  return useApiQuery<ApiPromotion[]>(
    `promotions:${merchantId}`,
    () => getPromotionsForMerchantFromApi(merchantId),
    [],
  );
}

// ──────────────────────────────────────────────────────────────
// useMerchantFromApi — fetch a single merchant by exact ID
// ──────────────────────────────────────────────────────────────

export function useMerchantFromApi(merchantId: string): ApiState<ApiMerchant | null> {
  return useApiQuery<ApiMerchant | null>(
    `merchant:${merchantId}`,
    () => getMerchantByIdFromApi(merchantId),
    null,
  );
}
