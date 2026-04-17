"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "optiwallet:cards";

/**
 * Hook minimalista para la wallet del usuario.
 * En Fase 2.2 esto se sincroniza con backend si el usuario crea cuenta,
 * pero por ahora todo vive en localStorage y la app funciona 100% offline.
 */
export function useWallet() {
  const [cardIds, setCardIds] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Cargar desde localStorage al montar
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setCardIds(parsed);
      }
    } catch {
      // localStorage puede no existir (incognito en Firefox, por ejemplo)
    } finally {
      setHydrated(true);
    }
  }, []);

  const persist = useCallback((next: string[]) => {
    setCardIds(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {}
  }, []);

  const addCard = useCallback(
    (cardId: string) => {
      if (cardIds.includes(cardId)) return;
      persist([...cardIds, cardId]);
    },
    [cardIds, persist],
  );

  const removeCard = useCallback(
    (cardId: string) => {
      persist(cardIds.filter((id) => id !== cardId));
    },
    [cardIds, persist],
  );

  const toggleCard = useCallback(
    (cardId: string) => {
      if (cardIds.includes(cardId)) {
        persist(cardIds.filter((id) => id !== cardId));
      } else {
        persist([...cardIds, cardId]);
      }
    },
    [cardIds, persist],
  );

  const clearWallet = useCallback(() => {
    persist([]);
  }, [persist]);

  return {
    cardIds,
    hydrated,
    isEmpty: cardIds.length === 0,
    addCard,
    removeCard,
    toggleCard,
    clearWallet,
  };
}
