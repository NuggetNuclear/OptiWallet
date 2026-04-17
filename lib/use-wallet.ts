"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "optiwallet:cards";

/**
 * Hook minimalista para la wallet del usuario.
 * En Fase 2.2 esto se sincroniza con backend si el usuario crea cuenta,
 * pero por ahora todo vive en localStorage y la app funciona 100% offline.
 *
 * Estado combinado en un solo objeto para evitar renders en cascada al hidratar.
 * (React requiere un único setState por efecto –react-hooks/set-state-in-effect)
 */
export function useWallet() {
  const [state, setState] = useState<{ cardIds: string[]; hydrated: boolean }>(
    { cardIds: [], hydrated: false },
  );

  // Cargar desde localStorage al montar (single setState call → sin cascada)
  useEffect(() => {
    let loaded: string[] = [];
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) loaded = parsed;
      }
    } catch {
      // localStorage puede no existir (incognito en Firefox, por ejemplo)
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard SSR hydration: localStorage unavailable until mount
    setState({ cardIds: loaded, hydrated: true });
  }, []);

  const persist = useCallback((next: string[]) => {
    setState((prev) => ({ ...prev, cardIds: next }));
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {}
  }, []);

  const addCard = useCallback(
    (cardId: string) => {
      if (state.cardIds.includes(cardId)) return;
      persist([...state.cardIds, cardId]);
    },
    [state.cardIds, persist],
  );

  const removeCard = useCallback(
    (cardId: string) => {
      persist(state.cardIds.filter((id) => id !== cardId));
    },
    [state.cardIds, persist],
  );

  const toggleCard = useCallback(
    (cardId: string) => {
      if (state.cardIds.includes(cardId)) {
        persist(state.cardIds.filter((id) => id !== cardId));
      } else {
        persist([...state.cardIds, cardId]);
      }
    },
    [state.cardIds, persist],
  );

  const clearWallet = useCallback(() => {
    persist([]);
  }, [persist]);

  return {
    cardIds: state.cardIds,
    hydrated: state.hydrated,
    isEmpty: state.cardIds.length === 0,
    addCard,
    removeCard,
    toggleCard,
    clearWallet,
  };
}
