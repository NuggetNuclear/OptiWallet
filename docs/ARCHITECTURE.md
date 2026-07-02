# Arquitectura de OptiWallet

> Última actualización: 2026-07-01 · v1.0.0-beta.2

Este documento describe la arquitectura técnica de **OptiWallet** — la PWA pública end-user + marketing + APIs de lectura. Para la visión general y el setup local, ver [`README.md`](../README.md).

> **Nota:** el panel de administración (auth, CRUD, pipeline de scraping, ops) vive en un repo separado, `Optiwallet-admin`, con su propio despliegue (`admin.optiwallet.cl`) y su propia documentación. Ambos repos comparten el mismo Neon (una sola DB) — ver `ARCHITECTURE_DECISION.md` para el racional del split.

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
│    ├─ Maintenance redirect (app_settings)            │
│    └─ Redirección / → /app (cookie ow_standalone)   │
│                                                     │
│  app/                                                │
│    ├─ page.tsx         → Landing (client)            │
│    ├─ app/page.tsx     → Web app (client)            │
│    ├─ api/*            → 12 Route Handlers públicos  │
│    └─ blog/, contacto/ → Páginas internas (server)   │
│                                                     │
│  Route Handlers ──→ Neon PostgreSQL (serverless)     │
│                     (mismo Neon que Optiwallet-admin) │
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
| `/api/promo-events` | Route Handler | `app/api/promo-events/route.ts` | `POST` fire-and-forget: registra impresión (`view`) o tap (`tap`) de una promo. Siempre responde `204`, incluso con body inválido o error de DB. |
| `/api/promo-reports` · `/api/promo-reports/[id]` | Route Handlers | `app/api/promo-reports/` | `POST` crea un reporte de usuario (👎 en una promo, `reason` opcional); `PATCH /[id]` lo refina con el motivo elegido. |
| `/api/tags` | Route Handler | `app/api/tags/route.ts` | Etiquetas granulares (`merchant_tags`) con conteo de comercios. |
| `/api/stats` | Route Handler | `app/api/stats/route.ts` | Conteos para la landing. |
| `/api/openapi.json` | Route Handler (estático) | `app/api/openapi.json/route.ts` | Spec OpenAPI 3.1 (fuente: `lib/openapi.ts`). |
| `/mantencion` | Server component | `app/mantencion/page.tsx` | Pantalla de mantenimiento (redirigida por proxy.ts). |

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

- **Matcher:** `/`, `/app/:path*`, `/blog/:path*`, `/sobre-nosotros/:path*`, `/contacto/:path*`, `/privacidad/:path*`, `/terminos/:path*`, `/cookies/:path*`, `/prensa/:path*`, `/roadmap/:path*`, `/api-docs/:path*`, `/mantencion`.

Dos guards se evalúan en orden:

1. **Maintenance mode** (todas las rutas excepto `/mantencion` y assets estáticos): consulta `app_settings.maintenance_mode` en la DB (cacheado 30s en memoria vía `lib/maintenance.ts`). Si está activo → `307 /mantencion`. Falla abierto: si la DB no responde, no bloquea tráfico. El flag lo escribe el panel admin (repo separado) sobre la misma fila de `app_settings` en el Neon compartido — este repo solo lee.
2. **Guard PWA:** si path es `/` y la cookie `ow_standalone=1` existe → `307 /app`.

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
// Sin maximumScale ni userScalable: bloquear el zoom rompe accesibilidad
// y iOS lo ignora igual.
export const viewport: Viewport = {
  themeColor: "#0b0d0c",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",     // Habilita env(safe-area-inset-*)
};
```

---

## Service Worker

**Archivo:** `public/sw.js` (vanilla JS, no requiere build).

### Caches

| Cache | Nombre | Contenido |
|---|---|---|
| General | `optiwallet-${SW_VERSION}` | Reservado (fallback) |
| Estático | `optiwallet-static-${SW_VERSION}` | Shell precacheado + assets estáticos |
| API | `optiwallet-api-${SW_VERSION}` | Respuestas de API cacheadas |

`SW_VERSION` la reescribe `scripts/stamp-sw-version.ts` con el commit SHA del deploy (ver *Registro*) — los nombres reales de cache en producción son del tipo `optiwallet-static-<sha>`, no literalmente `v2`. El placeholder committeado es `"dev"`.

> **Historial de versiones (comentarios en el código fuente):**
> - **v2 (Sprint 2):** bump por el deep-linking — se precachea también `/app/wallet` y el fallback offline de rutas `/app/*` pasó a ser el shell de `/app`.
>
> El `activate` limpia automáticamente cualquier cache que no coincida con el `SW_VERSION` vigente, en cada deploy.

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
- Escucha `updatefound`; cuando hay una nueva versión instalada, expone `updateAvailable`, `applyUpdate()` y `dismiss()` para mostrar un banner de actualización (pill flotante glassmorphism con botón "Actualizar").

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
        ▼              ┌─────────────────────────────┐     ┌──────────────────┐
┌──────────────────┐   │           merchants         │     │  merchant_tags   │
│      cards       │   │─────────────────────────────│     │──────────────────│
│──────────────────│   │ id (PK, TEXT)               │     │ id (PK, TEXT)    │
│ id (PK, TEXT)    │   │ name                        │     │ label            │
│ bank_id (FK)     │   │ category_id (FK)            │     │ emoji            │
│ name             │   │ aliases (TEXT[])            │     └────────┬─────────┘
│ type             │   │ ── popularidad (ranking) ── │              │ 1:N
│ CHECK: credit/   │   │ places_rating (REAL)        │              ▼
│   debit/prepaid  │   │ places_ratings_total (INT)  │     ┌──────────────────┐
└──────────────────┘   │ places_branches (INT)       │     │ merchant_tag_map │
        │              │ popularity_prior (REAL 0-1) │     │──────────────────│
        │              │ merchant_tier (1-5)         │     │ merchant_id (FK) │
        │              │ popularity_updated_at       │     │ tag_id (FK)      │
        │              └───────┬─────────────────────┘     └──────────────────┘
        │                      │ 1:N                                 ▲
        │                      ▼                                     │ 1:N
        │      ┌────────────────────────────────┐                    │
        │      │           promotions           │────────────────────┘
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
               └───────┬────────────────────────┘
                       │ 1:N (códigos rotativos)
                       ▼
            ┌──────────────────────────────┐
            │       promotion_codes        │
            │───────────────────────────────│
            │ id (PK, BIGSERIAL)            │
            │ promotion_id (FK)             │
            │ code                          │
            │ start_date, end_date          │
            └──────────────────────────────┘
```

`promotion_codes` cubre promos con **código rotativo** (ej. un cupón distinto cada semana): si una promo tiene filas en `promotion_codes`, el código efectivo para una fecha dada se resuelve con un `LEFT JOIN` filtrado por rango de fechas en `/api/recommendations` (`COALESCE(pc.code, p.code)`), y la promo solo aparece si existe un código vigente para esa fecha. Si no tiene filas en `promotion_codes`, se usa el `code` estático de la promo (comportamiento histórico).

**Índices:**
- `idx_promotions_merchant` — `merchant_id`
- `idx_promotions_bank` — `bank_id`
- `idx_promotions_active` — `active`
- `idx_promotions_days` — `days_of_week` (GIN)
- `idx_promotions_card_ids` — `card_ids` (GIN)

**Columnas de popularidad de `merchants`:** pobladas por `scripts/compute-merchant-popularity.ts` (`npm run popularity:compute`) desde Google Places API (New). `popularity_prior` (0–1) y `merchant_tier` (1–5) alimentan el cold-start del ranking de promos cuando aún no hay tráfico propio; las columnas `places_*` guardan las señales crudas para re-tunear pesos sin re-consultar la API. Ver el flujo de recomendaciones más abajo. Todas se agregan vía `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, así que `npm run db:schema` las propaga a una DB existente.

**`merchant_tags` y `merchant_tag_map`:** implementan el sistema de etiquetas (tags) granulares transversales (por ejemplo: `combustible`, `sushi`, `delivery-apps`). A diferencia de `category_id` (donde un comercio pertenece a una única categoría macro), un comercio puede estar asociado a múltiples etiquetas mediante la relación N:N representada por `merchant_tag_map`. El borrado de etiquetas o comercios se propaga en cascada (`ON DELETE CASCADE`) en la tabla de mapeo.

**`promo_events`:** registra impresiones (`view`) y taps (`tap`) de promos — tráfico real para diluir gradualmente el cold-start de `popularity_prior` con señal propia (ver `POST /api/promo-events` en la tabla de routing). Columnas: `promotion_id` (FK), `merchant_id`/`bank_id` (denormalizados para queries analíticas), `event_type`, `location` (`feed`/`merchant_detail`/`search`), `session_id` (hash anónimo opcional, sin datos personales) y `occurred_at`. La fórmula de dilución bayesiana (`pop_efectiva = (N_taps + K·prior)/(N_views + K)`) está documentada como comentario en `schema.sql` pero **el cómputo de `pop_efectiva` a partir de estos eventos aún no está implementado** — hoy el ranking solo consume `popularity_prior` directamente (ver más abajo). Índices: `idx_promo_events_promo`, `idx_promo_events_merchant`, `idx_promo_events_occurred`, `idx_promo_events_type`.

**`promo_reports`:** registra reportes y comentarios de los usuarios cuando marcan 👎 en una promoción. Es un flujo de captura en dos fases (se crea al instante sin motivo, y se actualiza opcionalmente con la causa seleccionada: `expired`, `wrong_discount`, `not_found`, o `other` con texto libre en `note`). Mantiene un estado (`status`) de triage (`pending`, `resolved`, `dismissed`) que gestionan los administradores desde el panel.


### Convenciones de IDs

Todos los IDs son **slugs TEXT kebab-case** generados manualmente (no UUIDs):
- Patrón: `/^[A-Za-z0-9_.-]{1,64}$/`
- Ejemplos: `bci`, `bci-credit`, `comida-rapida`, `papa-johns`, `bci-kfc-lunes`
- Beneficio: debugging visual, URLs legibles, referencia cruzada manual desde la consola de Neon.

### Caching HTTP

Todos los Route Handlers responden con `Cache-Control`:

| Endpoint | `s-maxage` | `stale-while-revalidate` |
|---|---|---|
| `/api/banks`, `/api/cards`, `/api/categories` | 60s (1 min) | 120s (2 min) |
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
│          × cards, LEFT JOIN promotion_codes                │
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
│       - si tiene códigos rotativos, debe existir uno      │
│         vigente para `date` en promotion_codes            │
│     ORDER BY score compuesto DESC (ver más abajo)         │
│  4. Retornar array de recomendaciones rankeadas           │
└───────────────────────────────────────────────────────────┘
```

**Matching de tarjeta:** la condición vive en el JOIN del route y está extraída como función pura testeable `promoAppliesToCard` (`lib/recommendations.ts`). Si la promo tiene `card_ids` (≥ 1) aplica **solo** a esas tarjetas exactas (ej. "solo Mastercard Black") y `card_types` se ignora; si `card_ids` está vacío, aplica a cualquier tarjeta del banco cuyo `type` esté en `card_types`.

**Ranking por popularidad (implementado):** el `ORDER BY` de `/api/recommendations` calcula, en SQL, un score compuesto de 4 señales normalizadas a `[0, 1]` y pondera:

- **50% descuento** — `LEAST(COALESCE(discount, discount_per_unit, 0) / 100.0, 1.0)`.
- **20% popularidad** — `merchants.popularity_prior` (cold-start desde Google Places; `0.5` neutro si es `NULL`).
- **20% frescura** — exponential decay sobre `verified_at` con vida media de 90 días (`EXP(-0.693 · días / 90)`); `0` si no hay `verified_at`.
- **10% urgencia** — `1.0` si `end_date` está dentro de los próximos 7 días, si no `0`.

Este score reemplazó el `ORDER BY discount DESC` original; el cálculo completo vive inline en el `ORDER BY` de `app/api/recommendations/route.ts` (comentado ahí mismo, espejo de esta sección).

**Tráfico real (`promo_events`) — pendiente de consumir:** `POST /api/promo-events` ya registra impresiones (`view`) y taps (`tap`) por promo, comercio y ubicación (ver *Capa de datos*). La tabla existe y se está poblando, pero el score compuesto de arriba **todavía no consume `promo_events`** — sigue usando `popularity_prior` "crudo" tal cual lo dejó el bootstrap de Google Places. **Pendiente:** el cómputo de `pop_efectiva = (N_taps + K·popularity_prior)/(N_views + K)` (promedio bayesiano que diluye el prior frío a medida que se acumula tráfico propio) y su integración como reemplazo del término de popularidad en el `ORDER BY`.

**Fecha por defecto:** si no se envía `date`, se usa la fecha actual en zona `America/Santiago` (no UTC del servidor). Esto evita que desde las ~21:00 en Chile se muestren promos del día siguiente.

**Día de la semana:** se calcula con `getUTCDay()` sobre `dateStr + "T00:00:00Z"` — así el día corresponde siempre al calendario de la fecha recibida, independiente de la zona del servidor.

### Cálculo de Ahorro y Priorización Dinámica (`lib/recommendations.ts`)

Para evitar duplicación y permitir un testeo robusto, la lógica de negocio del cálculo de descuentos y el ordenamiento dinámico se centraliza en `lib/recommendations.ts`:

1. **`calculateSavings`**: Calcula el ahorro real en pesos chilenos para promos de **porcentaje**, considerando el descuento, el tope máximo (`cap`) y el monto mínimo de compra (`min_purchase`).
2. **`calculateSavingsPerUnit`**: Equivalente a `calculateSavings` pero para promos de tipo **fijo por unidad** (ej. $100/L en bencineras) — multiplica `units × discountPerUnit` y aplica el `cap` si existe.
3. **`calculateSavingsForRec`**: Dispatcher que recibe una recomendación completa y decide entre `calculateSavings` (si tiene `discount`) o `calculateSavingsPerUnit` (si tiene `discount_per_unit` con `discount_unit === "liter"`). Es la función que usan `rankRecommendations` y `calculateStackedSavings` internamente.
4. **`rankRecommendations` (Excluyentes)**:
   * Por defecto, ordena por el valor bruto del descuento (porcentaje o monto por unidad).
   * Si el usuario ingresa un monto (o litros) en la vista de detalle del comercio, re-ordena dinámicamente las recomendaciones por **ahorro real en pesos** vía `calculateSavingsForRec`. Esto resuelve el caso de decisiones **excluyentes**: para montos de compra altos, una tarjeta con menor porcentaje de descuento pero mayor tope puede ser la ganadora frente a otra con más descuento pero menor tope. Empates se desempatan primero por descuento bruto, luego por mayor `cap`.
5. **`calculateStackedSavings` (Apilables)**: Calcula el ahorro acumulado al aplicar de forma sucesiva múltiples promociones marcadas `stackable` (ej. un cupón del comercio junto a un beneficio de tarjeta bancaria). Ordena las promos apilables por mayor ahorro primero; las de porcentaje reducen el monto base para la siguiente promo de la cadena, las de por-unidad no.

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
│   │   ├── SkeletonCard × 4   [mientras cargan bancos/tarjetas]
│   │   ├── BankRow × N (expandible → CardRow × N)
│   │   └── BottomDock (CTA flotante)
│   │
│   ├── Home view (default)
│   │   ├── Header (TopBar + logo + search + wallet)
│   │   ├── DayPicker (selector horizontal de días)
│   │   ├── TodaysFeed
│   │   │   ├── SkeletonCard × 3   [mientras cargan recomendaciones]
│   │   │   └── FeedRow × N
│   │   ├── MerchantSearch
│   │   │   ├── CategoryChip × N   [también reutilizado para el filtro de tags, ?tags= ANY-of]
│   │   │   ├── SkeletonCard × 3   [mientras cargan comercios]
│   │   │   └── MerchantRow × N
│   │   └── Footer (disclaimer)
│   │
│   ├── MerchantDetail view
│   │   ├── TopBar + BackButton
│   │   ├── Merchant hero
│   │   ├── Amount input
│   │   ├── RecommendationCard (ganadora)
│   │   │   └── PromoFeedback     [👍/👎 compartido → POST /api/promo-reports]
│   │   ├── GroupedAlternativeCard × N
│   │   │   └── PromoFeedback     [mismo componente, antes duplicado por card]
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

## Constantes compartidas (`lib/constants.ts`)

`BANK_INFO` es el mapa centralizado de metadatos de bancos que necesitan múltiples componentes:

```typescript
BANK_INFO[bankId].color   // color hex de la marca — usado en RecommendationCard (gradiente) y WalletSetup (ícono)
BANK_INFO[bankId].letter  // abreviatura de 2-3 letras — usada en WalletSetup (ícono de banco)
```

Antes de esta extracción, el mismo mapa existía como constante local en `RecommendationCard.tsx` (`BANK_COLORS`) y como objeto dentro del render de `BankRow` en `WalletSetup.tsx` (`BANK_DISPLAY`). Mantenerlos separados era una fuente de desincronización silenciosa: agregar un banco nuevo requería actualizar dos archivos. Ahora hay un único punto de edición.

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
| `formatDiscount(discount, discountPerUnit, discountUnit)` | `"15%"` o `"$100/L"` según el tipo de promo |

**Nota importante:** `toISODateLocal` usa `getFullYear/getMonth/getDate` (hora local) en vez de `toISOString()` (UTC). En Chile (UTC-3/UTC-4), `toISOString()` ya es "mañana" desde las ~21:00 — mostraría promos incorrectas.
