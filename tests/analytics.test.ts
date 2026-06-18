import { describe, it, beforeEach, afterEach } from "node:test";
import { strictEqual, deepStrictEqual, ok } from "node:assert";
import { trackEvent, events } from "../lib/analytics.ts";

type G = Record<string, unknown>;

// Captura las llamadas a window.plausible(event, options) para verificar
// nombre de evento y props. Plausible se carga vía <Script> en el layout;
// aquí lo simulamos sobre un window mockeado.
type Call = { event: string; options?: { props?: Record<string, unknown> } };

function mockWindow(plausible?: (...args: unknown[]) => void) {
  (globalThis as G).window = plausible ? { plausible } : {};
}

describe("trackEvent — wrapper de Plausible", () => {
  let savedWindow: unknown;
  beforeEach(() => {
    savedWindow = (globalThis as G).window;
  });
  afterEach(() => {
    (globalThis as G).window = savedWindow;
  });

  it("no-op silencioso en SSR (window undefined)", () => {
    (globalThis as G).window = undefined;
    // No debe lanzar
    trackEvent("Test Event");
  });

  it("no-op si plausible no esta cargado (adblocker/offline)", () => {
    mockWindow(); // window sin .plausible
    // No debe lanzar
    trackEvent("Test Event");
  });

  it("llama a plausible con el nombre del evento", () => {
    const calls: Call[] = [];
    mockWindow((event, options) => calls.push({ event: event as string, options: options as Call["options"] }));
    trackEvent("Onboarding Started");
    strictEqual(calls.length, 1);
    strictEqual(calls[0].event, "Onboarding Started");
  });

  it("sin props -> options es undefined (no { props: undefined })", () => {
    const calls: Call[] = [];
    mockWindow((event, options) => calls.push({ event: event as string, options: options as Call["options"] }));
    trackEvent("Sin Props");
    strictEqual(calls[0].options, undefined);
  });

  it("con props -> los envuelve en { props }", () => {
    const calls: Call[] = [];
    mockWindow((event, options) => calls.push({ event: event as string, options: options as Call["options"] }));
    trackEvent("Con Props", { cards: 3, plan: "beta" });
    deepStrictEqual(calls[0].options, { props: { cards: 3, plan: "beta" } });
  });

  it("nunca rompe la app si plausible lanza una excepcion", () => {
    mockWindow(() => {
      throw new Error("plausible boom");
    });
    // El try/catch interno debe tragarse el error
    trackEvent("Evento Que Falla");
    ok(true);
  });

  it("ignora el evento si la ruta actual empieza con /admin", () => {
    const calls: Call[] = [];
    (globalThis as G).window = {
      plausible: (event, options) => calls.push({ event: event as string, options: options as Call["options"] }),
      location: { pathname: "/admin/dashboard" }
    };
    trackEvent("Onboarding Started");
    strictEqual(calls.length, 0);
  });

  it("permite el evento si la ruta actual no empieza con /admin", () => {
    const calls: Call[] = [];
    (globalThis as G).window = {
      plausible: (event, options) => calls.push({ event: event as string, options: options as Call["options"] }),
      location: { pathname: "/app/comercio" }
    };
    trackEvent("Onboarding Started");
    strictEqual(calls.length, 1);
    strictEqual(calls[0].event, "Onboarding Started");
  });

  it("no lanza si window.location es defectuoso o inaccesible", () => {
    const calls: Call[] = [];
    (globalThis as G).window = {
      plausible: (event, options) => calls.push({ event: event as string, options: options as Call["options"] }),
      get location() {
        throw new Error("unreachable location");
      }
    };
    // No debe lanzar y debe continuar a plausible
    trackEvent("Onboarding Started");
    strictEqual(calls.length, 1);
    strictEqual(calls[0].event, "Onboarding Started");
  });
});

describe("events — helpers de eventos tipados", () => {
  let savedWindow: unknown;
  let calls: Call[];
  beforeEach(() => {
    savedWindow = (globalThis as G).window;
    calls = [];
    mockWindow((event, options) => calls.push({ event: event as string, options: options as Call["options"] }));
  });
  afterEach(() => {
    (globalThis as G).window = savedWindow;
  });

  it("onboardingStarted -> 'Onboarding Started' sin props", () => {
    events.onboardingStarted();
    strictEqual(calls[0].event, "Onboarding Started");
    strictEqual(calls[0].options, undefined);
  });

  it("onboardingCompleted -> props { cards }", () => {
    events.onboardingCompleted(4);
    strictEqual(calls[0].event, "Onboarding Completed");
    deepStrictEqual(calls[0].options, { props: { cards: 4 } });
  });

  it("walletUpdated -> props { cards }", () => {
    events.walletUpdated(2);
    strictEqual(calls[0].event, "Wallet Updated");
    deepStrictEqual(calls[0].options, { props: { cards: 2 } });
  });

  it("ctaClick -> props { cta }", () => {
    events.ctaClick("hero-download");
    strictEqual(calls[0].event, "CTA Click");
    deepStrictEqual(calls[0].options, { props: { cta: "hero-download" } });
  });

  it("installModalOpened -> props { source }", () => {
    events.installModalOpened("topbar");
    deepStrictEqual(calls[0].options, { props: { source: "topbar" } });
  });

  it("installInstructionsViewed -> props { platform }", () => {
    events.installInstructionsViewed("ios");
    strictEqual(calls[0].event, "Install Instructions Viewed");
    deepStrictEqual(calls[0].options, { props: { platform: "ios" } });
  });

  it("merchantViewed -> props { merchant }", () => {
    events.merchantViewed("papa-johns");
    strictEqual(calls[0].event, "Merchant Viewed");
    deepStrictEqual(calls[0].options, { props: { merchant: "papa-johns" } });
  });

  it("promotionViewed -> props { promotionId, merchantId, bankId, location }", () => {
    events.promotionViewed({
      promotionId: "promo-1",
      merchantId: "jumbo",
      bankId: "bci",
      location: "winner",
    });
    strictEqual(calls[0].event, "Promotion Viewed");
    deepStrictEqual(calls[0].options, {
      props: {
        promotionId: "promo-1",
        merchantId: "jumbo",
        bankId: "bci",
        location: "winner",
      },
    });
  });

  it("promotionClicked -> props { promotionId, merchantId, bankId, location }", () => {
    events.promotionClicked({
      promotionId: "promo-1",
      merchantId: "jumbo",
      bankId: "bci",
      location: "winner",
    });
    strictEqual(calls[0].event, "Promotion Clicked");
    deepStrictEqual(calls[0].options, {
      props: {
        promotionId: "promo-1",
        merchantId: "jumbo",
        bankId: "bci",
        location: "winner",
      },
    });
  });
});
