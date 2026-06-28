// lib/analytics.ts
// Wrapper mínimo sobre Plausible (cargado en app/layout.tsx vía <Script>).
//
// Plausible es cookieless: no usa cookies ni identificadores persistentes,
// agrega los datos y no permite identificar usuarios individuales. Por eso
// no requiere banner de consentimiento bajo la ley 19.628 ni GDPR.
//
// Si el script no está cargado (env sin NEXT_PUBLIC_PLAUSIBLE_SRC,
// adblocker, offline), trackEvent es un no-op silencioso.

type EventProps = Record<string, string | number | boolean>;

declare global {
  interface Window {
    plausible?: (event: string, options?: { props?: EventProps }) => void;
  }
}

/**
 * Registra un evento custom en Plausible.
 * Nombres de eventos en Title Case por convención de Plausible Goals.
 */
export function trackEvent(event: string, props?: EventProps): void {
  if (typeof window === "undefined") return;
  try {
    if (window.location?.pathname?.startsWith("/admin")) return;
  } catch {
    // location might not be defined in tests, do not throw
  }
  try {
    window.plausible?.(event, props ? { props } : undefined);
  } catch {
    // analytics jamás debe romper la app
  }
}

// ─── Eventos de onboarding beta (US-ANA) ─────────────────────────────────────
// Funnel: Onboarding Started → Onboarding Completed
// + eventos de adquisición en la landing (CTA Click, Install Modal).

export const events = {
  onboardingStarted: () => trackEvent("Onboarding Started"),
  onboardingCompleted: (cardCount: number) =>
    trackEvent("Onboarding Completed", { cards: cardCount }),
  walletUpdated: (cardCount: number) =>
    trackEvent("Wallet Updated", { cards: cardCount }),
  ctaClick: (cta: string) => trackEvent("CTA Click", { cta }),
  installModalOpened: (source: string) =>
    trackEvent("Install Modal Opened", { source }),
  installInstructionsViewed: (platform: "android" | "ios") =>
    trackEvent("Install Instructions Viewed", { platform }),
  merchantViewed: (merchantId: string) =>
    trackEvent("Merchant Viewed", { merchant: merchantId }),
  promotionViewed: (props: {
    promotionId: string;
    merchantId: string;
    bankId: string;
    location: "winner" | "alternative" | "list";
  }) => trackEvent("Promotion Viewed", props),
  promotionClicked: (props: {
    promotionId: string;
    merchantId: string;
    bankId: string;
    location: "winner" | "alternative" | "list";
  }) => trackEvent("Promotion Clicked", props),
  promotionFeedback: (props: {
    promotionId: string;
    merchantId: string;
    bankId: string;
    feedback: "up" | "down";
  }) => trackEvent("Promotion Feedback", props),
} as const;

// ─── Plausible Goals — guía de configuración ──────────────────────────────────
// Para que los eventos custom aparezcan en el dashboard de Plausible hay que
// registrar cada uno como "Goal" en plausible.io → Sitio → Goals → + Goal.
//
// Tipo de todos los Goals: Custom event (no Pageview).
// Los nombres son CASE-SENSITIVE — deben coincidir exactamente con los strings
// de trackEvent() de arriba.
//
// ┌─────────────────────────────────┬──────────────────────────────────────────┐
// │ Goal name (exacto)              │ Custom props a registrar (opcional)      │
// ├─────────────────────────────────┼──────────────────────────────────────────┤
// │ Onboarding Started              │ —                                        │
// │ Onboarding Completed            │ cards (número)                           │
// │ Wallet Updated                  │ cards (número)                           │
// │ CTA Click                       │ cta (string — ej. "hero", "footer")      │
// │ Install Modal Opened            │ source (string — ej. "nav", "cta")       │
// │ Install Instructions Viewed     │ platform ("android" | "ios")             │
// │ Merchant Viewed                 │ merchant (string — merchant ID)          │
// │ Promotion Viewed                │ promotionId, merchantId, bankId, location│
// │ Promotion Clicked               │ promotionId, merchantId, bankId, location│
// │ Promotion Feedback              │ promotionId, merchantId, bankId, feedback│
// └─────────────────────────────────┴──────────────────────────────────────────┘
//
// Pasos para registrar un Goal con Custom Props en Plausible:
//   1. plausible.io → tu sitio → Goals → + Goal
//   2. Tipo: "Custom event", Event name: (exacto de la tabla)
//   3. En la sección "Custom props", agregar cada prop del evento
//      (Plausible los autocompleta con los datos ya recibidos)
//   4. Guardar — el Goal y sus props empiezan a aparecer en el dashboard
//      con datos desde ese momento (no retroactivo)
//
// Nota: si NEXT_PUBLIC_PLAUSIBLE_SRC no está seteado, el script de Plausible
// no carga y todos los trackEvent() son no-ops silenciosos. Ver docs/ADMIN.md
// para la guía de activación de variables de entorno en Vercel.
