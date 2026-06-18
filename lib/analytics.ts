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
} as const;
