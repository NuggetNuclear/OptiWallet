"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

// ──────────────────────────────────────────────────────────────
// Generic result shape
// ──────────────────────────────────────────────────────────────

interface ApiState<T> {
  data: T;
  loading: boolean;
  error: string | null;
}

// ──────────────────────────────────────────────────────────────
// useBanks — load all banks once
// ──────────────────────────────────────────────────────────────

export function useBanks(): ApiState<ApiBank[]> {
  const [state, setState] = useState<ApiState<ApiBank[]>>({
    data: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    getBanksFromApi()
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, error: null });
      })
      .catch((err) => {
        if (!cancelled) setState({ data: [], loading: false, error: err.message });
      });
    return () => { cancelled = true; };
  }, []);

  return state;
}

// ──────────────────────────────────────────────────────────────
// useCards — load all cards once
// ──────────────────────────────────────────────────────────────

export function useCards(): ApiState<ApiCard[]> {
  const [state, setState] = useState<ApiState<ApiCard[]>>({
    data: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    getCardsFromApi()
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, error: null });
      })
      .catch((err) => {
        if (!cancelled) setState({ data: [], loading: false, error: err.message });
      });
    return () => { cancelled = true; };
  }, []);

  return state;
}

// ──────────────────────────────────────────────────────────────
// useCategories — load all merchant categories once
// ──────────────────────────────────────────────────────────────

export function useCategories(): ApiState<ApiCategory[]> {
  const [state, setState] = useState<ApiState<ApiCategory[]>>({
    data: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    getCategoriesFromApi()
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, error: null });
      })
      .catch((err) => {
        if (!cancelled) setState({ data: [], loading: false, error: err.message });
      });
    return () => { cancelled = true; };
  }, []);

  return state;
}

// ──────────────────────────────────────────────────────────────
// useMerchants — search merchants with debounce
// ──────────────────────────────────────────────────────────────

export function useMerchants(
  query: string,
  category: string | null,
): ApiState<ApiMerchant[]> {
  const [state, setState] = useState<ApiState<ApiMerchant[]>>({
    data: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));

    const timer = setTimeout(() => {
      getMerchantsFromApi({
        q: query || undefined,
        category: category || undefined,
      })
        .then((data) => {
          if (!cancelled) setState({ data, loading: false, error: null });
        })
        .catch((err) => {
          if (!cancelled) setState({ data: [], loading: false, error: err.message });
        });
    }, query ? 200 : 0); // debounce only on text input

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, category]);

  return state;
}

// ──────────────────────────────────────────────────────────────
// useRecommendations — fetch recommendations for given cards/date
// ──────────────────────────────────────────────────────────────

export function useRecommendations(
  cardIds: string[],
  date: Date,
  merchantId?: string,
): ApiState<ApiRecommendation[]> {
  const [state, setState] = useState<ApiState<ApiRecommendation[]>>({
    data: [],
    loading: true,
    error: null,
  });

  // Stabilize cardIds array reference for the effect dependency
  const cardIdsKey = cardIds.join(",");
  const dateKey = date.toISOString().split("T")[0];

  useEffect(() => {
    if (cardIds.length === 0) {
      setState({ data: [], loading: false, error: null });
      return;
    }

    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));

    getRecommendationsFromApi({ cardIds, date, merchantId })
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, error: null });
      })
      .catch((err) => {
        if (!cancelled) setState({ data: [], loading: false, error: err.message });
      });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardIdsKey, dateKey, merchantId]);

  return state;
}

// ──────────────────────────────────────────────────────────────
// usePromotions — fetch all promotions for a merchant
// ──────────────────────────────────────────────────────────────

export function usePromotions(merchantId: string): ApiState<ApiPromotion[]> {
  const [state, setState] = useState<ApiState<ApiPromotion[]>>({
    data: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));

    getPromotionsForMerchantFromApi(merchantId)
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, error: null });
      })
      .catch((err) => {
        if (!cancelled) setState({ data: [], loading: false, error: err.message });
      });

    return () => { cancelled = true; };
  }, [merchantId]);

  return state;
}

// ──────────────────────────────────────────────────────────────
// useMerchantFromApi — fetch a single merchant by exact ID
// ──────────────────────────────────────────────────────────────

export function useMerchantFromApi(merchantId: string): ApiState<ApiMerchant | null> {
  const [state, setState] = useState<ApiState<ApiMerchant | null>>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    getMerchantByIdFromApi(merchantId)
      .then((merchant) => {
        if (!cancelled) setState({ data: merchant, loading: false, error: null });
      })
      .catch((err) => {
        if (!cancelled) setState({ data: null, loading: false, error: err.message });
      });

    return () => { cancelled = true; };
  }, [merchantId]);

  return state;
}
