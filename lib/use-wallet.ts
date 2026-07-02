"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "optiwallet:cards";

/**
 * Hook minimalista para la wallet del usuario.
 * En Fase 2.2 esto se sincroniza con backend si el usuario crea cuenta,
 * pero por ahora todo vive en localStorage — sin cuentas ni sync entre
 * dispositivos. (Los datos de promos sí requieren conexión: vienen de la API.)
 *
 * Estado combinado en un solo objeto para evitar renders en cascada al hidratar.
 * (React requiere un único setState por efecto –react-hooks/set-state-in-effect)
 */
export function useWallet() {
  const [state, setState] = useState<{
    cardIds: string[];
    hydrated: boolean;
    initiallyEmpty: boolean;
  }>({ cardIds: [], hydrated: false, initiallyEmpty: true });

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
    setState({ cardIds: loaded, hydrated: true, initiallyEmpty: loaded.length === 0 });

    // Sync entre tabs/ventanas: en Android la PWA instalada comparte
    // localStorage con Chrome — sin esto, editar la wallet en una deja a la
    // otra con datos viejos hasta recargar. El evento `storage` solo dispara
    // en las OTRAS pestañas, así que no interfiere con los setters locales.
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      let next: string[] = [];
      try {
        const parsed = e.newValue ? JSON.parse(e.newValue) : [];
        if (Array.isArray(parsed)) next = parsed;
      } catch {
        // valor corrupto → wallet vacía
      }
      setState((prev) => ({ ...prev, cardIds: next }));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  /** Persiste un array de cardIds a localStorage (best-effort). */
  function saveToStorage(next: string[]) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (e) {
      console.warn("[OptiWallet] No se pudo guardar la wallet en localStorage:", e);
    }
  }

  const addCard = useCallback(
    (cardId: string) => {
      setState((prev) => {
        if (prev.cardIds.includes(cardId)) return prev;
        const next = [...prev.cardIds, cardId];
        saveToStorage(next);
        return { ...prev, cardIds: next };
      });
    },
    [],
  );

  const removeCard = useCallback(
    (cardId: string) => {
      setState((prev) => {
        const next = prev.cardIds.filter((id) => id !== cardId);
        saveToStorage(next);
        return { ...prev, cardIds: next };
      });
    },
    [],
  );

  const toggleCard = useCallback(
    (cardId: string) => {
      setState((prev) => {
        const next = prev.cardIds.includes(cardId)
          ? prev.cardIds.filter((id) => id !== cardId)
          : [...prev.cardIds, cardId];
        saveToStorage(next);
        return { ...prev, cardIds: next };
      });
    },
    [],
  );

  const clearWallet = useCallback(() => {
    setState((prev) => ({ ...prev, cardIds: [] }));
    saveToStorage([]);
  }, []);

  return {
    cardIds: state.cardIds,
    hydrated: state.hydrated,
    isEmpty: state.cardIds.length === 0,
    /** Si la wallet estaba vacía al hidratar — fija el flujo de onboarding
     *  una sola vez, sin cerrarlo a mitad cuando se marca la primera tarjeta. */
    initiallyEmpty: state.initiallyEmpty,
    addCard,
    removeCard,
    toggleCard,
    clearWallet,
  };
}
