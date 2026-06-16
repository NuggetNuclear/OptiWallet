# Arquitectura de OptiWallet

> Última actualización: 2026-06-16 · v1.0.0-beta.1

Este documento describe la arquitectura técnica completa de OptiWallet. Para la visión general y el setup local, ver [`README.md`](../README.md).

---

## Índice

- [Visión general](#visión-general)
- [Routing](#routing)
- [Sistema standalone / PWA](#sistema-standalone--pwa)
- [Service Worker](#service-worker)
- [Capa de datos](#capa-de-datos)
- [Flujo de recomendaciones](#flujo-de-recomendaciones)
- [State management (cliente)](#state-management-cliente)
- [Jerarquía de componentes](#jerarquía-de-componentes)
- [Design system y layout tokens](#design-system-y-layout-tokens)
- [Transiciones de página](#transiciones-de-página)
- [Páginas internas](#páginas-internas)

---

## Visión general

OptiWallet es una **PWA** construida con **Next.js 16 App Router**. El frontend es enteramente **client-side** (`"use client"`) para la app y la landing; las páginas internas (blog, contacto, legal) son server components. El backend es un set de **Route Handlers** (serverless Node.js en Vercel) que consultan directamente **Neon PostgreSQL** sin ORM.

```
┌─────────────────────────────────────────────────────┐
│                    Vercel (gru1)                     │
│                                                     │
│  proxy.ts (middleware)                               │
│    ├─ Redirección / → /app (cookie ow_standalone)   │
│    └─ Auth guard /admin/* (cookie ow_admin_session) │
│                                                     │
│  app/                                                │
│    ├─ page.tsx         → Landing (client)            │
│    ├─ app/page.tsx     → Web app (client)            │
│    ├─ admin/*          → Panel admin (server+client) │
│    ├─ api/*            → 8 Route Handlers públicos   │
│    ├─ api/admin/*      → API admin (auth requerida)  │
│    └─ blog/, contacto/ → Páginas internas (server)   │
│                                                     │
│  Route Handlers ──→ Neon PostgreSQL (serverless)     │
│                                                     │
│  public/sw.js          → Service Worker              │
│  public/manifest.json  → PWA manifest                │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────┐
│           Navegador / PWA           │
│                                     │
│  localStorage  →  wallet del user   │
│  Service Worker →  offline cache    │
│  Cookie ow_standalone → redirect    │
└─────────────────────────────────────┘
```

---

## Routing

| Ruta | Tipo | Módulo | Propósito |
|---|---|---|---|
| `/` | Client component | `app/page.tsx` | Landing page de marketing. Stats dinámicos de `/api/stats` + `InstallModal` (popup Android/iOS). |
| `/app` | Client component | `app/app/page.tsx` | Home de la app: feed del día + búsqueda. Día seleccionado deep-linkable vía `?dia=0..6`. Onboarding inline si la wallet está vacía. |
| `/app/wallet` | Client component | `app/app/wallet/page.tsx` | Gestión de tarjetas (US-DL: antes era `view === "wallet"`). |
| `/app/comercio/[merchantId]` | Client component | `app/app/comercio/[merchantId]/page.tsx` | Detalle de comercio, acepta `?dia=` (US-DL: antes era `view === "merchant"`). |
| `/api-docs` | Client component | `app/api-docs/page.tsx` | Swagger UI self-hosted sobre `/api/openapi.json` (US-003). |
| `/blog`, `/contacto`, `/cookies`, `/prensa`, `/privacidad`, `/roadmap`, `/sobre-nosotros`, `/terminos` | Server components | `app/<slug>/page.tsx` | Páginas internas que usan `InnerPageLayout`. |
| `/api/banks` | Route Handler | `app/api/banks/route.ts` | Todos los bancos. |
| `/api/cards` | Route Handler | `app/api/cards/route.ts` | Tarjetas, opcionalmente por banco. |
| `/api/categories` | Route Handler | `app/api/categories/route.ts` | Categorías con conteo de comercios. |
| `/api/merchants` | Route Handler | `app/api/merchants/route.ts` | Búsqueda fuzzy de comercios. |
| `/api/merchants/[merchantId]` | Route Handler | `app/api/merchants/[merchantId]/route.ts` | Comercio por ID exacto. |
| `/api/promotions/[merchantId]` | Route Handler | `app/api/promotions/[merchantId]/route.ts` | Promos activas de un comercio. |
| `/api/recommendations` | Route Handler | `app/api/recommendations/route.ts` | **Core:** recomendaciones cruzadas. |
| `/api/stats` | Route Handler | `app/api/stats/route.ts` | Conteos para la landing. |
| `/api/openapi.json` | Route Handler (estático) | `app/api/openapi.json/route.ts` | Spec OpenAPI 3.1 (fuente: `lib/openapi.ts`). |
| `/admin` | Server + client components | `app/admin/` | Dashboard del panel de administración (requiere sesión). |
| `/admin/login` | Client component | `app/admin/login/page.tsx` | Login dos fases: contraseña → TOTP. |
| `/admin/totp-setup` | Client component | `app/admin/totp-setup/page.tsx` | Enrolamiento TOTP (primer login). |
| `/admin/users` | Client component | `app/admin/users/page.tsx` | CRUD de admins. |
| `/admin/data/*` | Client components | `app/admin/data/*/page.tsx` | CRUD de `banks`, `cards`, `categories`, `merchants`, `promotions`. |
| `/api/admin/auth/*` | Route Handlers | `app/api/admin/auth/` | Login, verify-totp, logout, me. |
| `/api/admin/users/*` | Route Handlers | `app/api/admin/users/` | CRUD de admin users + TOTP setup. |
| `/api/admin/data/*` | Route Handlers | `app/api/admin/data/` | CRUD + deps de las 5 entidades. |

### Deep-linking en `/app` (US-DL, Sprint 2)

Las vistas de la app son **rutas reales del App Router** — URLs compartibles y back del browser funcional:

- El **estado compartido** entre rutas no vive en un store global: la wallet se rehidrata de `localStorage` en cada ruta (`useWallet`) y "hoy" se recalcula con `lib/hooks/use-today.ts` (`useToday` + `effectiveDateFor` + `parseDiaParam`).
- El **día seleccionado** viaja por la URL (`?dia=0..6`, donde 0=domingo) y se propaga de `/app` a `/app/comercio/[id]` al navegar. Valores inválidos caen de vuelta a "hoy".
- El **onboarding** sigue siendo estado local de `/app`: es una condición (wallet vacía al hidratar), no una vista navegable.
- Las páginas que leen `useSearchParams` van envueltas en `<Suspense>` (requisito de Next para el prerender estático).

### Errores y observabilidad (US-ERR / US-ANA, Sprint 2)

- **`app/error.tsx`**: error boundary global — captura excepciones de render bajo el root layout, las reporta a Sentry y muestra UI branded con retry.
- **`app/global-error.tsx`**: último recurso si el propio root layout falla — renderiza `<html>/<body>` propios con estilos inline.
- **Sentry** (`@sentry/nextjs`): init por runtime vía `instrumentation.ts` (Node/Edge) + `instrumentation-client.ts` (browser); opciones compartidas en `lib/sentry.ts`. **Deshabilitado sin `NEXT_PUBLIC_SENTRY_DSN`**. `sendDefaultPii: false` — coherente con la política de privacidad.
- **Plausible** (`lib/analytics.ts` + `<Script>` en root layout): analytics cookieless. Usa el **script v2** (`<script async src=...>` + stub inline que llama `plausible.init()`), activado solo con `NEXT_PUBLIC_PLAUSIBLE_SRC`. Los eventos custom siguen yendo por `window.plausible(...)` (cola del stub). Eventos de onboarding: `Onboarding Started/Completed`, `Wallet Updated`, `CTA Click`, `Install Modal Opened`, `Install Instructions Viewed`, `Merchant Viewed`.

### Middleware (`proxy.ts`)

Next.js 16 usa `proxy.ts` en la raíz como convención de middleware (reemplaza a `middleware.ts`, que está deprecado en esta versión).

- **Matcher:** `/` y `/admin/:path*`.
- **Guard admin:** si el path empieza con `/admin` y no es `/admin/login`, verifica la cookie `ow_admin_session` (HMAC-SHA256). Si no es válida o está ausente → `307 /admin/login`. Si la sesión existe pero `totp_enabled = false` → `307 /admin/totp-setup`.
- **Guard PWA:** si path es `/` y la cookie `ow_standalone=1` existe → `307 /app`.
- **Propósito dual:** que la PWA instalada aterrice en la app + proteger el panel admin en el Edge antes de renderizar nada.

Para la arquitectura completa del panel de administración, ver [`docs/ADMIN.md`](ADMIN.md).

---

## Sistema standalone / PWA

Cuando el usuario instala la PWA ("Añadir a pantalla de inicio"), la app debe abrirse en `/app`, no en la landing de marketing. Tres piezas cooperan para lograrlo:

```
┌──────────────────────────────────────────────────────────────┐
│                 FLUJO DE REDIRECCIÓN STANDALONE               │
│                                                              │
│  1. StandaloneCookieSync (root layout, todas las páginas)    │
│     └─ Detecta standalone vía matchMedia + navigator.standalone │
│     └─ Setea cookie ow_standalone=1 (o la borra si es browser) │
│                                                              │
│  2. proxy.ts (middleware, server-side, solo matcher /)       │
│     └─ Si cookie ow_standalone=1 → redirect / → /app (307)  │
│     └─ Sin flash de landing                                  │
│                                                              │
│  3. StandaloneRedirect (landing, client-side, fallback)      │
│     └─ Primera visita standalone: cookie aún no existe       │
│     └─ Offline: SW sirve landing cacheada sin middleware     │
│     └─ router.replace("/app")                                │
└──────────────────────────────────────────────────────────────┘
```

### Detección de standalone (`lib/standalone.ts`)

```typescript
// Dos APIs para detectar PWA instalada:
// 1. CSS media query: (display-mode: standalone) — estándar W3C
// 2. navigator.standalone — API legacy de iOS Safari (no estándar)
export function isStandalone(): boolean {
  return matchMedia("(display-mode: standalone)").matches
    || navigator.standalone === true;
}
```

### Cookie `ow_standalone`

- **Nombre:** `ow_standalone`
- **Valores:** `1` (standalone) o eliminada (browser)
- **Path:** `/`
- **Max-age:** 1 año (standalone) o `0` para borrar
- **SameSite:** `Lax`
- **Secure:** solo en HTTPS (permite testing local en http://localhost)

**Auto-reparación Android:** en Android, la PWA y Chrome comparten cookies. `StandaloneCookieSync` corre en *todas* las páginas: si detecta browser normal, borra la cookie. Así, si el middleware redirige por error, la landing vuelve a ser accesible desde Chrome.

### Manifest (`public/manifest.json`)

| Campo | Valor | Nota |
|---|---|---|
| `display` | `standalone` | Sin barra del navegador |
| `orientation` | `portrait` | Bloqueado a vertical |
| `start_url` | `/app` | Aterriza en la app al abrir |
| `background_color` | `#0b0d0c` | Splash screen |
| `theme_color` | `#0b0d0c` | Barra de estado |
| `lang` | `es-CL` | Español de Chile |
| Íconos | 192px, 512px (any), 512px (maskable) | PNG |

### Viewport (root layout)

```typescript
export const viewport: Viewport = {
  themeColor: "#0b0d0c",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,      // Evita zoom accidental en inputs
  viewportFit: "cover",     // Habilita env(safe-area-inset-*)
};
```

---

## Service Worker

**Archivo:** `public/sw.js` (vanilla JS, no requiere build).

### Caches

| Cache | Nombre | Contenido |
|---|---|---|
| General | `optiwallet-v2` | Reservado (fallback) |
| Estático | `optiwallet-static-v2` | Shell precacheado + assets estáticos |
| API | `optiwallet-api-v2` | Respuestas de API cacheadas |

> **v2 (Sprint 2):** bump por el deep-linking — se precachea también `/app/wallet` y el fallback offline de rutas `/app/*` pasó a ser el shell de `/app`. El `activate` limpia los caches v1 automáticamente.

### Precache (install)

Se cachean al instalar el SW:
- `/`, `/app`, `/app/wallet`, `/manifest.json`
- `/icon-192.png`, `/icon-512.png`, `/icon-maskable.png`

### Estrategias de cache (fetch)

```
┌──────────────────────┬────────────────────────────────────────────┐
│ Tipo de recurso      │ Estrategia                                 │
├──────────────────────┼────────────────────────────────────────────┤
│ API (/api/*)         │ Network-first → fallback a cache           │
│ Assets estáticos     │ Cache-first → actualiza en background      │
│ (_next/static, .png, │ (stale-while-revalidate)                   │
│  .css, .js, etc.)    │                                            │
│ HTML (páginas)       │ Network-first → fallback a cache o /       │
└──────────────────────┴────────────────────────────────────────────┘
```

**Fallback offline:**
- Respuestas JSON: `{"error":"Sin conexión","offline":true}` con `503`.
- Páginas HTML: deep links `/app/*` caen al shell cacheado de `/app` (el usuario sigue dentro de la app); el resto cae a `/` (landing cacheada).

### Registro

- Solo se registra en **producción** (`NODE_ENV === "production"`).
- Se registra **después del evento `load`** para no bloquear la carga inicial.
- Hook: `lib/hooks/use-service-worker.ts` → componente: `ServiceWorkerRegistrar`.
- Escucha `updatefound` y loguea cuando hay una nueva versión disponible (en beta, sin banner de actualización).

### Ciclo de vida

1. **Install:** precache + `skipWaiting()` (activación inmediata).
2. **Activate:** limpia caches de versiones anteriores + `clients.claim()` (toma control de todas las tabs).
3. **Fetch:** intercepta solo requests GET del mismo origen.

---

## Capa de datos

### Base de datos

**Neon PostgreSQL** (serverless, driver HTTP). No hay ORM ni query builder — se usan **tagged template literals** directos del driver de Neon, que parametrizan automáticamente.

**Cliente:** `lib/db.ts` exporta una función `sql` (tagged template) con **inicialización lazy**:

```typescript
let cachedClient: NeonQueryFunction<false, false> | null = null;

export function sql(strings: TemplateStringsArray, ...values: unknown[]) {
  if (!cachedClient) {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL no está definida");
    cachedClient = neon(process.env.DATABASE_URL);
  }
  return cachedClient(strings, ...values);
}
```

**¿Por qué lazy?** `next build` evalúa los route modules durante la recolección de datos de página, cuando `DATABASE_URL` no está disponible. El lazy init difiere la conexión al primer request real.

### Schema

Fuente de verdad: `scripts/schema.sql`.

```
┌──────────────────┐     ┌──────────────────┐
│      banks       │     │   merchant_      │
│──────────────────│     │   categories     │
│ id (PK, TEXT)    │     │──────────────────│
│ name             │     │ id (PK, TEXT)    │
│ short_name       │     │ label            │
│ available        │     │ emoji            │
│ color            │     └───────┬──────────┘
└───────┬──────────┘             │ 1:N
        │ 1:N                     ▼
        ▼              ┌─────────────────────────────┐
┌──────────────────┐   │           merchants         │
│      cards       │   │─────────────────────────────│
│──────────────────│   │ id (PK, TEXT)               │
│ id (PK, TEXT)    │   │ name                        │
│ bank_id (FK)     │   │ category_id (FK)            │
│ name             │   │ aliases (TEXT[])            │
│ type             │   │ ── popularidad (ranking) ── │
│ CHECK: credit/   │   │ places_rating (REAL)        │
│   debit/prepaid  │   │ places_ratings_total (INT)  │
└──────────────────┘   │ places_branches (INT)       │
        │              │ popularity_prior (REAL 0-1) │
        │              │ merchant_tier (1-5)         │
        │              │ popularity_updated_at       │
        │              └───────┬─────────────────────┘
        │                      │ 1:N
        │                      ▼
        │      ┌────────────────────────────────┐
        │      │           promotions           │
        │      │────────────────────────────────│
        └─FK───│ id (PK, TEXT)                  │
               │ bank_id (FK)                   │
               │ merchant_id (FK)               │
               │ card_types (TEXT[])            │
               │ card_ids (TEXT[], def '{}')    │  ← "tarjeta única" (M5)
               │ discount (1-100, nullable)     │
               │ discount_per_unit / _unit      │  ← $X por litro (M4); XOR con discount
               │ cap, min_purchase (nullable)   │
               │ days_of_week (INT[])           │
               │ start_date, end_date           │
               │ modality (presencial/online/both) │
               │ stackable (BOOLEAN)            │
               │ code, conditions               │
               │ source, verified_at            │
               │ active (BOOLEAN)               │
               │ created_at, updated_at         │
               └────────────────────────────────┘
```

**Índices:**
- `idx_promotions_merchant` — `merchant_id`
- `idx_promotions_bank` — `bank_id`
- `idx_promotions_active` — `active`
- `idx_promotions_days` — `days_of_week` (GIN)
- `idx_promotions_card_ids` — `card_ids` (GIN)

**Columnas de popularidad de `merchants`:** pobladas por `scripts/compute-merchant-popularity.ts` (`npm run popularity:compute`) desde Google Places API (New). `popularity_prior` (0–1) y `merchant_tier` (1–5) alimentan el cold-start del ranking de promos cuando aún no hay tráfico propio; las columnas `places_*` guardan las señales crudas para re-tunear pesos sin re-consultar la API. Ver el flujo de recomendaciones más abajo. Todas se agregan vía `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, así que `npm run db:schema` las propaga a una DB existente.

### Convenciones de IDs

Todos los IDs son **slugs TEXT kebab-case** generados manualmente (no UUIDs):
- Patrón: `/^[A-Za-z0-9_.-]{1,64}$/`
- Ejemplos: `bci`, `bci-credit`, `comida-rapida`, `papa-johns`, `bci-kfc-lunes`
- Beneficio: debugging visual, URLs legibles, referencia cruzada manual desde la consola de Neon.

### Caching HTTP

Todos los Route Handlers responden con `Cache-Control`:

| Endpoint | `s-maxage` | `stale-while-revalidate` |
|---|---|---|
| `/api/banks`, `/api/cards`, `/api/categories` | 300s (5 min) | 600s (10 min) |
| `/api/merchants`, `/api/merchants/[id]`, `/api/promotions/[id]`, `/api/recommendations` | 60s (1 min) | 300s (5 min) |
| `/api/stats` | 60s (1 min) | 300s (5 min) |

---

## Flujo de recomendaciones

El endpoint `/api/recommendations` es el **core del producto**. Cruza tarjetas del usuario × promos activas × comercios para generar la mejor recomendación.

```
┌───────────────────────────────────────────────────────────┐
│              GET /api/recommendations                      │
│                                                           │
│  Params: cardIds[], date (YYYY-MM-DD), merchantId?        │
│                                                           │
│  1. Validar inputs (formato IDs, fecha, límites)          │
│  2. Calcular dayOfWeek de la fecha                        │
│  3. Query SQL:                                            │
│     JOIN promotions × merchants × merchant_categories     │
│          × cards                                          │
│     WHERE:                                                │
│       - c.id IN cardIds (las tarjetas del usuario)        │
│       - c.bank_id = p.bank_id (mismo banco)              │
│       - matching de tarjeta: si p.card_ids ≠ '{}' →      │
│         c.id = ANY(p.card_ids) ("tarjeta única");        │
│         si no → c.type = ANY(p.card_types)               │
│       - p.active = true                                   │
│       - dayOfWeek ∈ p.days_of_week (o vacío = todos)     │
│       - start_date <= date <= end_date (si existen)      │
│       - merchantId filter (si viene)                      │
│     ORDER BY discount DESC                                │
│  4. Retornar array de recomendaciones rankeadas           │
└───────────────────────────────────────────────────────────┘
```

**Matching de tarjeta:** la condición vive en el JOIN del route y está extraída como función pura testeable `promoAppliesToCard` (`lib/recommendations.ts`). Si la promo tiene `card_ids` (≥ 1) aplica **solo** a esas tarjetas exactas (ej. "solo Mastercard Black") y `card_types` se ignora; si `card_ids` está vacío, aplica a cualquier tarjeta del banco cuyo `type` esté en `card_types`.

**Ranking por popularidad (en desarrollo):** hoy el orden final es `discount DESC`. El siguiente paso es ponderar con la popularidad del comercio para que una promo de una marca masiva no quede bajo una de un local sin tráfico. El prior ya está disponible en `merchants.popularity_prior` (bootstrappeado desde Google Places, ver *Capa de datos*); la idea acordada es un score compuesto `popularidad·w1 + calidad_promo·w2 + frescura·w3 + urgencia·w4`, con el prior funcionando como "visitas fantasma" en un promedio bayesiano que se diluye al llegar tráfico real (`pop_efectiva = (visitas + K·prior)/(N + K)`). **Pendientes:** la query consumidora que usa `popularity_prior` y una tabla `promo_events` para loguear el tráfico real.

**Fecha por defecto:** si no se envía `date`, se usa la fecha actual en zona `America/Santiago` (no UTC del servidor). Esto evita que desde las ~21:00 en Chile se muestren promos del día siguiente.

**Día de la semana:** se calcula con `getUTCDay()` sobre `dateStr + "T00:00:00Z"` — así el día corresponde siempre al calendario de la fecha recibida, independiente de la zona del servidor.

### Cálculo de Ahorro y Priorización Dinámica (`lib/recommendations.ts`)

Para evitar duplicación y permitir un testeo robusto, la lógica de negocio del cálculo de descuentos y el ordenamiento dinámico se centraliza en `lib/recommendations.ts`:

1. **`calculateSavings`**: Calcula el ahorro real en pesos chilenos considerando el porcentaje de descuento, el tope máximo (`cap`) y el monto mínimo de compra (`min_purchase`).
2. **`rankRecommendations` (Excluyentes)**:
   * Por defecto, ordena por porcentaje de descuento.
   * Si el usuario ingresa un monto en la vista de detalle del comercio, re-ordena dinámicamente las recomendaciones por **ahorro real en pesos**. Esto resuelve el caso de decisiones **excluyentes**: para montos de compra altos, una tarjeta con menor porcentaje de descuento pero mayor tope puede ser la ganadora frente a otra con más descuento pero menor tope.
3. **`calculateStackedSavings` (Apilables)**: Calcula el ahorro acumulado al aplicar de forma sucesiva múltiples promociones (ej. un cupón del comercio junto a un beneficio de tarjeta bancaria). El descuento secundario se aplica de manera acumulativa sobre el monto restante después del primer descuento.

---

## State management (cliente)

No se usa ninguna librería de estado global. El estado se gestiona con hooks de React:

### Wallet del usuario (`lib/use-wallet.ts`)

- **Storage:** `localStorage` bajo la key `optiwallet:cards` (array de IDs de tarjeta).
- **Hook:** `useWallet()` retorna:
  - `cardIds` — tarjetas seleccionadas
  - `hydrated` — `false` hasta que se lee localStorage (evita mismatches SSR)
  - `isEmpty` — derivado de `cardIds.length === 0`
  - `initiallyEmpty` — captura si la wallet estaba vacía al hidratar; fija el flujo de onboarding una sola vez sin cerrarlo a mitad cuando se marca la primera tarjeta
  - `addCard`, `removeCard`, `toggleCard`, `clearWallet` — mutadores
- **Estado combinado:** todos los campos en un solo `useState` para evitar renders en cascada al hidratar.
- **Sin sync remoto:** no hay cuentas de usuario ni persistencia server-side.

### Hooks de API (`lib/hooks/use-api.ts`)

Hook genérico `useApiQuery`:
- **Cache key:** string que codifica los parámetros. Cuando cambia la key, se refetch.
- **Loading derivado:** se compara `result.key !== currentKey` en vez de `setState(loading)` síncrono dentro del efecto (evita renders en cascada).
- **Debounce:** configurable por hook (200ms para búsqueda de merchants).
- **Skip:** `useRecommendations` se salta si `cardIds` está vacío.
- **Stale data:** mientras carga una key nueva, se mantiene la data anterior (los componentes usan `loading` para mostrar skeletons).

Hooks expuestos: `useBanks`, `useCards`, `useCategories`, `useMerchants`, `useRecommendations`, `usePromotions`, `useMerchantFromApi`.

### API client (`lib/api-client.ts`)

Capa de fetch tipada que convierte los endpoints en funciones async:
- Tipos `Api*` en snake_case (match directo con las columnas de Neon).
- `buildUrl` helper que construye query strings sin depender de `window.location.origin` (SSR-safe con dummy base).
- Cada función lanza `Error` si `!res.ok`.

---

## Jerarquía de componentes

```
RootLayout (app/layout.tsx)
├── ServiceWorkerRegistrar     [invisible — registra SW]
├── StandaloneCookieSync       [invisible — sync cookie]
│
├── LandingPage (/)
│   ├── StandaloneRedirect     [invisible — fallback redirect]
│   ├── usePageTransition      [overlay de transición → /app]
│   ├── Nav, Hero, Marquee, HowItWorks, Features
│   ├── NumbersStrip, Quote, InstallPWA, FAQ, FinalCTA
│   └── Footer
│
├── HomePage (/app)
│   ├── PageTransition (mode="arrive")  [loading screen]
│   │
│   ├── WalletSetup (onboarding, si initiallyEmpty)
│   │   ├── TopBar (variant="plain")
│   │   ├── BankRow × N (expandible → CardRow × N)
│   │   └── BottomDock (CTA flotante)
│   │
│   ├── Home view (default)
│   │   ├── Header (TopBar + logo + search + wallet)
│   │   ├── DayPicker (selector horizontal de días)
│   │   ├── TodaysFeed (FeedRow × N)
│   │   ├── MerchantSearch
│   │   │   ├── CategoryChip × N
│   │   │   └── MerchantRow × N
│   │   └── Footer (disclaimer)
│   │
│   ├── MerchantDetail view
│   │   ├── TopBar + BackButton
│   │   ├── Merchant hero
│   │   ├── Amount input
│   │   ├── RecommendationCard (ganadora)
│   │   ├── AlternativeCard × N
│   │   ├── PromoRow × N (todas las promos)
│   │   └── Disclaimer
│   │
│   └── WalletSetup (mode="manage")
│
└── InnerPageLayout (blog, contacto, etc.)
    ├── Nav (con links al landing)
    ├── {children} (contenido de cada página)
    └── Footer
```

---

## Design system y layout tokens

### Colores (`globals.css` → `@theme`)

| Token | Valor | Uso |
|---|---|---|
| `--bg` | `#0b0d0c` | Fondo principal |
| `--bg-2` | `#13161a` | Superficies elevadas (cards, inputs) |
| `--bg-3` | `#1a1f1c` | Superficies más elevadas (avatares, badges) |
| `--ink` | `#f5f1e8` | Texto principal (blanco cálido) |
| `--ink-dim` | `#9a958a` | Texto secundario / labels |
| `--paper` | `#ede6d3` | Referencia papel (no usada directamente aún) |
| `--lime` | `#d4ff3a` | Acento primario — CTAs, selecciones, ganadora |
| `--lime-deep` | `#a8d400` | Variante profunda de lime (gradientes) |
| `--copper` | `#d67846` | Acento secundario — warnings, vigencias |
| `--plum` | `#4a2d5a` | Glows decorativos (fondo) |
| `--line` | `rgba(245,241,232,0.12)` | Bordes sutiles |
| `--line-strong` | `rgba(245,241,232,0.28)` | Bordes activos / hover |

### Fuentes

| Fuente | Variable CSS | Uso |
|---|---|---|
| **Fraunces** (serif) | `--font-fraunces` | Títulos, porcentajes de descuento, cifras hero |
| **Sora** (sans-serif) | `--font-sora` | Cuerpo de texto, párrafos, labels de UI |
| **JetBrains Mono** (monospace) | `--font-jetbrains` | Micro-labels, chips técnicos, tags uppercase |

Self-hosted vía `next/font/google` — no se hacen llamadas a Google Fonts en runtime.

### Layout tokens

```css
:root {
  --safe-top: env(safe-area-inset-top, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);
  --page-px: 20px;          /* padding horizontal de página */
  --topbar-pad-y: 14px;     /* padding vertical de la barra superior */
  --dock-pad-y: 16px;       /* padding vertical del dock inferior */
  --topbar-pad-top: calc(var(--safe-top) + var(--topbar-pad-y));
  --dock-pad-bottom: calc(var(--safe-bottom) + var(--dock-pad-y));
}
```

**Regla fundamental:** las safe-areas de iOS (notch, Dynamic Island, home indicator) son responsabilidad **exclusiva** de las primitivas `TopBar` y `BottomDock`. Ningún componente duplica `env(safe-area-inset-*)` por su cuenta.

### Estrategia CSS

| Zona | Herramienta | Razón |
|---|---|---|
| Web app (`/app`) | Tailwind 4 utilities | Composición rápida con clases |
| Landing page (`/`) | Vanilla CSS scoped (`.landing-root`) | ~1200 líneas de estilos editoriales que no se mezclan con la app |
| Globales | Vanilla CSS (`globals.css`) | Design tokens, animaciones, botones estándar |

### Efectos decorativos

- **Grain overlay:** `body::before` con SVG `feTurbulence` fractal noise, `mix-blend-mode: overlay`, `opacity: 0.035`.
- **Glows:** `.glow-lime`, `.glow-plum`, `.glow-copper` — radial gradients con `blur(80px)`, posicionados absolutos.
- **Pulse dot:** `.pulse-dot` — animación scale+opacity en 2s, usada en logos y badges "live".
- **Staggered children:** `.stagger-children > *` — fadeUp con delays incrementales (50ms por hijo).

---

## Transiciones de página

### `PageTransition` component

Dos modos:

1. **`navigate`** (landing → app):
   - Fase `entering` (300ms): overlay fade-in sobre la landing
   - Fase `holding` (600ms): shimmer bar + logo OptiWallet
   - `router.push(href)` + fase `exiting` (350ms): fade-out del overlay
   - Resultado: la app renderiza debajo y se revela

2. **`arrive`** (app carga):
   - Arranca visible (`holding`)
   - Espera 100ms, luego `exiting` (350ms)
   - `onComplete` → `PageTransition` retorna `null`, la app renderiza

### `usePageTransition` hook

Usado en la landing para disparar la transición:
```typescript
const { trigger, overlay } = usePageTransition();
// trigger("/app") → renderiza overlay + navega
// overlay es el JSX del overlay (o null)
```

---

## Páginas internas

Todas las páginas bajo `/blog`, `/contacto`, `/cookies`, `/prensa`, `/privacidad`, `/roadmap`, `/sobre-nosotros` y `/terminos` usan `InnerPageLayout`:

- **Server components** (no `"use client"`).
- Layout compartido: nav con links al landing, footer completo, landing.css importado.
- Contenido específico de cada página como `children`.
- Muchas usan el componente `ComingSoon` como placeholder (beta).

`ComingSoon` renderiza un card con ícono, título, descripción y link de contacto (`mailto:hola@optiwallet.cl`).

---

## Formato y localización (`lib/format.ts`)

Toda la localización está hardcoded a **es-CL** (español de Chile):

| Función | Output |
|---|---|
| `formatDate(date)` | `"Miércoles · 29 de abril"` |
| `formatDateShort(date)` | `"29 abr"` |
| `formatDayOfWeek(day)` | `"Miércoles"` |
| `formatDayShort(day)` | `"Mié"` |
| `formatCLP(amount)` | `"$12.500"` |
| `toISODateLocal(date)` | `"2026-04-29"` (hora local, no UTC) |
| `daysOfWeekLabel(days)` | `"Lun, Mié, Vie"` o `"Todos los días"` |
| `modalityLabel(modality)` | `"Online y presencial"` |

**Nota importante:** `toISODateLocal` usa `getFullYear/getMonth/getDate` (hora local) en vez de `toISOString()` (UTC). En Chile (UTC-3/UTC-4), `toISOString()` ya es "mañana" desde las ~21:00 — mostraría promos incorrectas.
