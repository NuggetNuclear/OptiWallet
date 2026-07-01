import { describe, it, beforeEach, afterEach } from "node:test";
import { strictEqual, ok } from "node:assert";
import { getSnapshot, getServerSnapshot, subscribe } from "./use-online-status.ts";

// Node >= 21 expone `navigator` como getter global no-configurable-por-asignación
// directa (`globalThis.navigator = x` falla en silencio en modo no estricto y
// lanza en ESM estricto). Object.defineProperty sí puede pisarlo porque el
// descriptor original es `configurable: true`.
function setGlobal(name: string, value: unknown) {
  Object.defineProperty(globalThis, name, {
    value,
    configurable: true,
    writable: true,
    enumerable: true,
  });
}

// ──────────────────────────── getServerSnapshot ────────────────────────────

describe("getServerSnapshot — valor servido en SSR", () => {
  it("siempre retorna true (evita el banner en el HTML servido)", () => {
    strictEqual(getServerSnapshot(), true);
  });
});

// ──────────────────────────────── getSnapshot ───────────────────────────────

describe("getSnapshot — valor real del navegador", () => {
  let savedNavigator: PropertyDescriptor | undefined;
  beforeEach(() => {
    savedNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  });
  afterEach(() => {
    if (savedNavigator) Object.defineProperty(globalThis, "navigator", savedNavigator);
  });

  it("retorna true cuando navigator.onLine es true", () => {
    setGlobal("navigator", { onLine: true });
    strictEqual(getSnapshot(), true);
  });

  it("retorna false cuando navigator.onLine es false", () => {
    setGlobal("navigator", { onLine: false });
    strictEqual(getSnapshot(), false);
  });
});

// ────────────────────────────────── subscribe ───────────────────────────────

describe("subscribe — listeners online/offline", () => {
  let savedWindow: PropertyDescriptor | undefined;
  beforeEach(() => {
    savedWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  });
  afterEach(() => {
    if (savedWindow) Object.defineProperty(globalThis, "window", savedWindow);
  });

  function makeFakeWindow() {
    const listeners: Record<string, Array<() => void>> = { online: [], offline: [] };
    return {
      listeners,
      addEventListener(type: string, cb: () => void) {
        listeners[type].push(cb);
      },
      removeEventListener(type: string, cb: () => void) {
        listeners[type] = listeners[type].filter((l) => l !== cb);
      },
    };
  }

  it("registra listeners para 'online' y 'offline' al suscribirse", () => {
    const fakeWindow = makeFakeWindow();
    setGlobal("window", fakeWindow);
    const callback = () => {};
    subscribe(callback);
    strictEqual(fakeWindow.listeners.online.length, 1);
    strictEqual(fakeWindow.listeners.offline.length, 1);
  });

  it("el cleanup retornado remueve ambos listeners", () => {
    const fakeWindow = makeFakeWindow();
    setGlobal("window", fakeWindow);
    const callback = () => {};
    const cleanup = subscribe(callback);
    cleanup();
    strictEqual(fakeWindow.listeners.online.length, 0);
    strictEqual(fakeWindow.listeners.offline.length, 0);
  });

  it("el mismo callback se dispara para ambos listeners", () => {
    const fakeWindow = makeFakeWindow();
    setGlobal("window", fakeWindow);
    let calls = 0;
    subscribe(() => { calls++; });
    fakeWindow.listeners.online[0]();
    fakeWindow.listeners.offline[0]();
    strictEqual(calls, 2);
    ok(true);
  });
});
