// OptiWallet Service Worker
// Sprint 2 — PWA offline support
// Estrategia: Cache-first para assets estáticos, Network-first para API

// v2 (Sprint 2): deep-linking — /app/wallet y /app/comercio/[id] son rutas
// reales. Se precachea también /app/wallet y el fallback offline de rutas
// /app/* ahora es el shell de /app (no la landing).
//
// SW_VERSION lo reescribe `scripts/stamp-sw-version.ts` en cada build (corre
// como `prebuild`): se reemplaza por el commit SHA del deploy. Esto cambia los
// bytes de /sw.js en CADA deploy, que es lo único que hace que el browser
// dispare `updatefound` → aparece el banner "nueva versión disponible".
// En dev queda "dev" (da igual: el SW solo se registra en producción).
const SW_VERSION = "dev";

// Versionamos los caches con SW_VERSION para que cada deploy purgue los caches
// viejos (en `activate`) y se reprecachee el shell con el código nuevo.
const CACHE_NAME = `optiwallet-${SW_VERSION}`;
const STATIC_CACHE_NAME = `optiwallet-static-${SW_VERSION}`;
const API_CACHE_NAME = `optiwallet-api-${SW_VERSION}`;

// Assets que cacheamos inmediatamente al instalar
const PRECACHE_URLS = [
  "/",
  "/app",
  "/app/wallet",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable.png",
];

// ─── INSTALL ──────────────────────────────────────────────────────────────────
// Se ejecuta una sola vez cuando el SW se registra por primera vez.
// Precacheamos los assets críticos para que la app funcione offline.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
  );
});

// ─── MESSAGE ──────────────────────────────────────────────────────────────────
// Permite que la app pida explícitamente que el SW en espera tome control.
// Usado por el banner de "nueva versión disponible" (applyUpdate).
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// ─── ACTIVATE ─────────────────────────────────────────────────────────────────
// Limpia caches viejos de versiones anteriores del SW.
self.addEventListener("activate", (event) => {
  const validCaches = [CACHE_NAME, STATIC_CACHE_NAME, API_CACHE_NAME];

  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !validCaches.includes(key))
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim()) // toma control de todas las tabs abiertas
  );
});

// ─── FETCH ────────────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Solo interceptamos requests del mismo origen
  if (url.origin !== self.location.origin) return;

  // Ignoramos requests que no son GET
  if (request.method !== "GET") return;

  // Estrategia según el tipo de recurso
  if (isAPIRoute(url.pathname)) {
    event.respondWith(networkFirstStrategy(request, API_CACHE_NAME));
  } else if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirstStrategy(request, STATIC_CACHE_NAME));
  } else {
    // Páginas HTML: network-first — use STATIC_CACHE_NAME where pages are precached
    event.respondWith(networkFirstStrategy(request, STATIC_CACHE_NAME));
  }
});

// ─── ESTRATEGIAS DE CACHE ─────────────────────────────────────────────────────

// Tope de entradas del cache de API. Cada combinación de query string
// (cardIds × fecha × comercio) es una entrada distinta: sin tope, una PWA
// abierta varios días acumula storage sin límite. FIFO simple: el Cache API
// lista las keys en orden de inserción.
const API_CACHE_MAX_ENTRIES = 60;

async function trimCache(cache, maxEntries) {
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  await Promise.all(
    keys.slice(0, keys.length - maxEntries).map((key) => cache.delete(key))
  );
}

/**
 * Network-first: intenta la red, si falla usa el cache.
 * Ideal para API y páginas que cambian frecuentemente.
 */
async function networkFirstStrategy(request, cacheName) {
  const cache = await caches.open(cacheName);

  try {
    const networkResponse = await fetch(request);

    // Solo cacheamos respuestas exitosas
    if (networkResponse.ok) {
      await cache.put(request, networkResponse.clone());
      if (cacheName === API_CACHE_NAME) {
        trimCache(cache, API_CACHE_MAX_ENTRIES).catch(() => {});
      }
    }

    return networkResponse;
  } catch {
    const pathname = new URL(request.url).pathname;

    // Sin red — intentamos servir desde cache
    const cachedResponse = await cache.match(request);

    if (cachedResponse) {
      return cachedResponse;
    }

    // Si tampoco hay cache, devolvemos una respuesta de error amigable
    if (isAPIRoute(pathname) || request.headers.get("accept")?.includes("application/json")) {
      return new Response(
        JSON.stringify({ error: "Sin conexión", offline: true }),
        {
          status: 503,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Para páginas HTML: deep links /app/* caen al shell cacheado de /app
    // (el usuario sigue dentro de la app offline); el resto, a la landing.
    const fallbackPath = pathname.startsWith("/app") ? "/app" : "/";
    const staticCache = await caches.open(STATIC_CACHE_NAME);
    const fallback =
      (await cache.match(fallbackPath)) ||
      (await staticCache.match(fallbackPath)) ||
      (await staticCache.match("/"));
    return fallback || new Response("Sin conexión", { status: 503 });
  }
}

/**
 * Cache-first: sirve desde cache, actualiza en background.
 * Ideal para íconos, fuentes y assets que no cambian.
 */
async function cacheFirstStrategy(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);

  if (cachedResponse) {
    // Actualiza el cache en background (stale-while-revalidate)
    fetch(request)
      .then((networkResponse) => {
        if (networkResponse.ok) cache.put(request, networkResponse);
      })
      .catch(() => { }); // silencia errores de red en background

    return cachedResponse;
  }

  // No está en cache — buscamos en la red y cacheamos
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    return new Response("Asset no disponible offline", { status: 503 });
  }
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function isAPIRoute(pathname) {
  return pathname.startsWith("/api/");
}

function isStaticAsset(pathname) {
  return (
    pathname.startsWith("/_next/static/") ||
    pathname.match(/\.(png|jpg|jpeg|svg|ico|woff2?|css|js)$/)
  );
}
