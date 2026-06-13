import { describe, it, beforeEach, afterEach } from "node:test";
import { strictEqual, ok } from "node:assert";
import { isStandalone, syncStandaloneCookie, STANDALONE_COOKIE } from "../lib/standalone.ts";

type G = Record<string, unknown>;

function mockWindow(opts: { matchMedia?: boolean; iosStandalone?: boolean; protocol?: string }) {
  (globalThis as G).window = {
    location: { protocol: opts.protocol ?? "https:" },
    navigator: opts.iosStandalone !== undefined ? { standalone: opts.iosStandalone } : {},
    matchMedia: (q: string) => ({
      matches: q === "(display-mode: standalone)" && (opts.matchMedia ?? false),
    }),
  };
}

function makeCookieStore() {
  let cookies: string[] = [];
  let lastSet = "";
  return {
    get cookie() { return cookies.join("; "); },
    set cookie(val: string) {
      lastSet = val;
      const parts = val.split(";").map((s: string) => s.trim());
      const [name] = parts[0].split("=");
      if (parts.some((p: string) => p.startsWith("max-age=0"))) {
        cookies = cookies.filter((c: string) => !c.startsWith(name + "="));
      } else {
        cookies = cookies.filter((c: string) => !c.startsWith(name + "="));
        cookies.push(parts[0]);
      }
    },
    lastSet() { return lastSet; },
    cookies() { return cookies; },
    preset(c: string[]) { cookies = [...c]; },
    clearLastSet() { lastSet = ""; },
  };
}

// ──────────────────────────── isStandalone ────────────────────────────────────

describe("isStandalone — deteccion de modo PWA", () => {
  let savedWindow: unknown;
  beforeEach(() => { savedWindow = (globalThis as G).window; });
  afterEach(() => { (globalThis as G).window = savedWindow; });

  it("retorna false si window es undefined (SSR / Node)", () => {
    (globalThis as G).window = undefined;
    strictEqual(isStandalone(), false);
  });

  it("retorna true si display-mode es standalone (Android / Desktop PWA)", () => {
    mockWindow({ matchMedia: true });
    strictEqual(isStandalone(), true);
  });

  it("retorna true si navigator.standalone es true (iOS Safari)", () => {
    mockWindow({ matchMedia: false, iosStandalone: true });
    strictEqual(isStandalone(), true);
  });

  it("retorna true si ambas condiciones son verdaderas simultaneamente", () => {
    mockWindow({ matchMedia: true, iosStandalone: true });
    strictEqual(isStandalone(), true);
  });

  it("retorna false si ninguna condicion se cumple (navegador estandar)", () => {
    mockWindow({ matchMedia: false, iosStandalone: false });
    strictEqual(isStandalone(), false);
  });

  it("retorna false si navigator.standalone es undefined (Chrome sin PWA)", () => {
    mockWindow({ matchMedia: false });
    strictEqual(isStandalone(), false);
  });
});

// ────────────────────────── syncStandaloneCookie ──────────────────────────────

describe("syncStandaloneCookie — sincronizacion de cookie SSR<->client", () => {
  let savedWindow: unknown;
  let savedDocument: unknown;
  beforeEach(() => {
    savedWindow = (globalThis as G).window;
    savedDocument = (globalThis as G).document;
  });
  afterEach(() => {
    (globalThis as G).window = savedWindow;
    (globalThis as G).document = savedDocument;
  });

  it("es no-op si document es undefined (SSR)", () => {
    (globalThis as G).document = undefined;
    syncStandaloneCookie();
    ok(true);
  });

  it("en modo standalone + HTTPS: crea la cookie con ; secure", () => {
    const store = makeCookieStore();
    (globalThis as G).document = store;
    mockWindow({ matchMedia: true, protocol: "https:" });
    syncStandaloneCookie();
    ok(store.cookies().includes(STANDALONE_COOKIE + "=1"), "debe crear la cookie");
    ok(store.lastSet().includes("; secure"), "debe incluir ; secure en HTTPS");
  });

  it("en modo standalone + HTTP: crea la cookie sin ; secure", () => {
    const store = makeCookieStore();
    (globalThis as G).document = store;
    mockWindow({ matchMedia: true, protocol: "http:" });
    syncStandaloneCookie();
    ok(store.cookies().includes(STANDALONE_COOKIE + "=1"), "debe crear la cookie");
    ok(!store.lastSet().includes("; secure"), "NO debe incluir ; secure en HTTP");
  });

  it("la cookie incluye max-age=31536000 (1 anio) al crearla", () => {
    const store = makeCookieStore();
    (globalThis as G).document = store;
    mockWindow({ matchMedia: true, protocol: "https:" });
    syncStandaloneCookie();
    ok(store.lastSet().includes("max-age=31536000"), "debe incluir max-age de 1 anio");
  });

  it("la cookie incluye path=/ y samesite=lax", () => {
    const store = makeCookieStore();
    (globalThis as G).document = store;
    mockWindow({ matchMedia: true, protocol: "https:" });
    syncStandaloneCookie();
    ok(store.lastSet().includes("path=/"), "debe incluir path=/");
    ok(store.lastSet().includes("samesite=lax"), "debe incluir samesite=lax");
  });

  it("NOT standalone + cookie existente: la elimina con max-age=0", () => {
    const store = makeCookieStore();
    store.preset([STANDALONE_COOKIE + "=1"]);
    (globalThis as G).document = store;
    mockWindow({ matchMedia: false, iosStandalone: false, protocol: "https:" });
    syncStandaloneCookie();
    strictEqual(store.cookies().length, 0, "debe eliminar la cookie");
    ok(store.lastSet().includes("max-age=0"), "debe usar max-age=0 para borrar");
  });

  it("NOT standalone + cookie NO existe: no escribe nada (sin write innecesario)", () => {
    const store = makeCookieStore();
    (globalThis as G).document = store;
    mockWindow({ matchMedia: false, iosStandalone: false, protocol: "https:" });
    syncStandaloneCookie();
    strictEqual(store.lastSet(), "", "no debe escribir si la cookie ya no existe");
  });

  it("iOS standalone (navigator.standalone): tambien crea la cookie", () => {
    const store = makeCookieStore();
    (globalThis as G).document = store;
    mockWindow({ matchMedia: false, iosStandalone: true, protocol: "https:" });
    syncStandaloneCookie();
    ok(store.cookies().includes(STANDALONE_COOKIE + "=1"));
  });
});
