import { describe, it, beforeEach, afterEach } from "node:test";
import { strictEqual, ok } from "node:assert";
import { isStandalone, syncStandaloneCookie, STANDALONE_COOKIE } from "../lib/standalone.ts";

describe("Detección Standalone PWA", () => {
  let originalWindow: unknown;
  let originalDocument: unknown;

  beforeEach(() => {
    originalWindow = (globalThis as Record<string, unknown>).window;
    originalDocument = (globalThis as Record<string, unknown>).document;
  });

  afterEach(() => {
    (globalThis as Record<string, unknown>).window = originalWindow;
    (globalThis as Record<string, unknown>).document = originalDocument;
  });

  it("retorna false si window es undefined (SSR)", () => {
    (globalThis as Record<string, unknown>).window = undefined;
    strictEqual(isStandalone(), false);
  });

  it("retorna true si display-mode es standalone en matchMedia", () => {
    const mockMatchMedia = (query: string) => ({
      matches: query === "(display-mode: standalone)",
    });

    (globalThis as Record<string, unknown>).window = {
      navigator: {},
      matchMedia: mockMatchMedia,
    };

    strictEqual(isStandalone(), true);
  });

  it("retorna true si navigator.standalone es true (iOS Safari)", () => {
    const mockMatchMedia = () => ({ matches: false });

    (globalThis as Record<string, unknown>).window = {
      navigator: { standalone: true },
      matchMedia: mockMatchMedia,
    };

    strictEqual(isStandalone(), true);
  });

  it("retorna false si no se cumple ninguna condición standalone", () => {
    const mockMatchMedia = () => ({ matches: false });

    (globalThis as Record<string, unknown>).window = {
      navigator: { standalone: false },
      matchMedia: mockMatchMedia,
    };

    strictEqual(isStandalone(), false);
  });
});

describe("Sincronización de Cookies de Standalone", () => {
  let originalWindow: unknown;
  let originalDocument: unknown;
  let mockCookies: string[] = [];

  beforeEach(() => {
    originalWindow = (globalThis as Record<string, unknown>).window;
    originalDocument = (globalThis as Record<string, unknown>).document;
    mockCookies = [];

    // Mock minimal del document.cookie
    const doc = {
      get cookie() {
        return mockCookies.join("; ");
      },
      set cookie(val: string) {
        const parts = val.split(";");
        const nameVal = parts[0].trim();
        const [name] = nameVal.split("=");
        // Si max-age=0, borramos la cookie
        if (parts.some((p) => p.includes("max-age=0"))) {
          mockCookies = mockCookies.filter((c) => !c.startsWith(`${name}=`));
        } else {
          // Reemplazar o insertar
          mockCookies = mockCookies.filter((c) => !c.startsWith(`${name}=`));
          mockCookies.push(nameVal);
        }
      },
    };
    (globalThis as Record<string, unknown>).document = doc;
  });

  afterEach(() => {
    (globalThis as Record<string, unknown>).window = originalWindow;
    (globalThis as Record<string, unknown>).document = originalDocument;
  });

  it("es no-op si document es undefined (SSR)", () => {
    (globalThis as Record<string, unknown>).document = undefined;
    // No debería fallar
    syncStandaloneCookie();
    ok(true);
  });

  it("crea la cookie standalone si la app está en modo standalone", () => {
    (globalThis as Record<string, unknown>).window = {
      location: { protocol: "https:" },
      navigator: {},
      matchMedia: (q: string) => ({ matches: q === "(display-mode: standalone)" }),
    };

    syncStandaloneCookie();
    ok(mockCookies.includes(`${STANDALONE_COOKIE}=1`));
  });

  it("elimina la cookie standalone si la app está en navegador estándar", () => {
    // Seteamos la cookie inicialmente
    mockCookies = [`${STANDALONE_COOKIE}=1`];

    (globalThis as Record<string, unknown>).window = {
      location: { protocol: "https:" },
      navigator: {},
      matchMedia: () => ({ matches: false }),
    };

    syncStandaloneCookie();
    strictEqual(mockCookies.length, 0);
  });

  it("aplica secure en HTTPS pero no en HTTP (desarrollo local)", () => {
    // 1. Caso HTTPS: debe inyectar "; secure"
    let lastCookieSet = "";
    (globalThis as Record<string, unknown>).document = {
      get cookie() {
        return "";
      },
      set cookie(val: string) {
        lastCookieSet = val;
      },
    };
    (globalThis as Record<string, unknown>).window = {
      location: { protocol: "https:" },
      navigator: {},
      matchMedia: () => ({ matches: true }),
    };

    syncStandaloneCookie();
    ok(lastCookieSet.includes("; secure"));

    // 2. Caso HTTP: no debe inyectar "; secure"
    lastCookieSet = "";
    (globalThis as Record<string, unknown>).window = {
      location: { protocol: "http:" },
      navigator: {},
      matchMedia: () => ({ matches: true }),
    };
    syncStandaloneCookie();
    ok(!lastCookieSet.includes("; secure"));
  });
});
