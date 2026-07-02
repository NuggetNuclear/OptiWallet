"use client";

// lib/hooks/use-promo-impression.ts
// Tracking unificado de impresiones y taps de promos. Cada evento se registra
// en DOS destinos con propósitos distintos:
//   - Plausible (opcional): métricas de producto agregadas, dashboard.
//   - promo_events (DB, fire-and-forget): señal cruda por promoción que
//     alimenta el ranking por engagement (fase 3).

import { useEffect, useRef } from "react";
import { events } from "@/lib/analytics";
import {
  logPromoEvent,
  type PromoEventLocation,
} from "@/lib/api-client";

type PlausibleLocation = "winner" | "alternative" | "list";

export interface PromoTrackingParams {
  promotionId: string;
  merchantId:  string;
  bankId:      string;
  /** Dónde ocurrió, para la tabla promo_events. */
  dbLocation: PromoEventLocation;
  /** Si se omite, el evento va solo a la DB (ej. filas del feed, que son
   *  demasiado volumen para Plausible). */
  plausibleLocation?: PlausibleLocation;
}

/**
 * Registra la impresión de una promo UNA vez por promoción mostrada.
 *
 * El guard es por `promotionId`, no por montaje: si el mismo card pasa a
 * mostrar otra promo (ej. cambia la ganadora al ingresar un monto en el
 * detalle), la nueva promo también cuenta como vista — con un ref booleano
 * esa segunda impresión se perdía.
 */
export function usePromoImpression({
  promotionId,
  merchantId,
  bankId,
  dbLocation,
  plausibleLocation,
}: PromoTrackingParams): void {
  const firedForRef = useRef<string | null>(null);

  useEffect(() => {
    if (firedForRef.current === promotionId) return;
    firedForRef.current = promotionId;
    if (plausibleLocation) {
      events.promotionViewed({ promotionId, merchantId, bankId, location: plausibleLocation });
    }
    logPromoEvent({ promotionId, merchantId, bankId, eventType: "view", location: dbLocation });
  }, [promotionId, merchantId, bankId, dbLocation, plausibleLocation]);
}

/** Registra un tap (clic en la promo / "Ver oferta") en ambos destinos. */
export function trackPromoTap({
  promotionId,
  merchantId,
  bankId,
  dbLocation,
  plausibleLocation,
}: PromoTrackingParams): void {
  if (plausibleLocation) {
    events.promotionClicked({ promotionId, merchantId, bankId, location: plausibleLocation });
  }
  logPromoEvent({ promotionId, merchantId, bankId, eventType: "tap", location: dbLocation });
}
