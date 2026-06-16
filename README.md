# OptiWallet

**Te dice con qué tarjeta pagar para ahorrar más, en cada comercio de Chile.**

OptiWallet cruza las promociones de bancos chilenos y recomienda la mejor tarjeta según el día y el comercio. Sin datos bancarios, sin cuentas, sin descargas — funciona como PWA directo desde el navegador, con soporte offline.

> v1.0.0-beta.1 · Solo para Chile 🇨🇱 · **Producción:** [optiwallet.vercel.app](https://optiwallet.vercel.app)

---

## Documentación

| Documento | Contenido |
|---|---|
| Este README | Visión general, setup, estructura, convenciones |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Arquitectura en detalle: routing, sistema standalone/PWA, service worker, flujo de datos, lógica de recomendaciones, jerarquía de componentes, design system |
| [`docs/API.md`](docs/API.md) | Referencia completa de los 8 endpoints: params, validación, respuestas, errores, caching |
| [`/api-docs`](https://optiwallet.vercel.app/api-docs) | **Swagger UI interactivo** (self-hosted) sobre el spec [`/api/openapi.json`](https://optiwallet.vercel.app/api/openapi.json) — fuente: `lib/openapi.ts` |
| [`TODO.md`](TODO.md) | Inventario de placeholders y pendientes operativos (prensa, sobre-nosotros, cifras de landing, activación Sentry/Plausible) |
| [`docs/SECURITY.md`](docs/SECURITY.md) | Postura de seguridad: headers, validación, manejo de secrets, recomendaciones operativas |
| [`OptiWallet/security-audit-2026-06-11.md`](OptiWallet/security-audit-2026-06-11.md) | Security audit completo (hallazgos + fixes aplicados) |
| [`OptiWallet/audit-report.md`](OptiWallet/audit-report.md) | Code audit 2026-06-10 (histórico — hallazgos ya resueltos) |

---

## Stack

| Capa | Tecnología | Versión (package.json) |
|---|---|---|
| Framework | Next.js (App Router, Turbopack) | ^16.2.9 |
| UI | React + TypeScript | ^19.2.5 + ^6.0.3 |
| Estilos | Tailwind CSS 4 (CSS-first) + vanilla CSS | ^4.2.4 |
| Base de datos | Neon PostgreSQL (serverless) | @neondatabase/serverless ^1.1.0 |
| Observabilidad | Sentry (`@sentry/nextjs`) | ^10.57.0 |
| Deploy | Vercel (serverless Node.js, región `gru1`) | — |
| Tipografía | Fraunces · Sora · JetBrains Mono | next/font (self-hosted en build) |
| PWA | manifest.json + service worker + redirección standalone | — |
| Testing | `node:test` + `node:assert` (nativo, cero dependencias) | Node ≥ 22 |
| Lint | ESLint 10 flat config + eslint-config-next | ^10.2.1 |

> Las versiones de `next` y `eslint-config-next` se mantienen en `^16.2.9` como **piso de seguridad** — versiones anteriores de la serie 16 tienen CVEs conocidos (ver [`docs/SECURITY.md`](docs/SECURITY.md)). No bajar de ahí.

---

## Correr localmente

```bash
# 1. Instalar dependencias
npm install

# 2. Crear .env.local con tu connection string de Neon
cp .env.example .env.local
# → Edita .env.local y pon tu DATABASE_URL

# 3. Levantar el servidor de desarrollo
npm run dev
```

Abre [localhost:3000](http://localhost:3000). La landing está en `/`, la app en `/app`.

### Variables de entorno

| Variable | Requerida | Uso |
|---|---|---|
| `DATABASE_URL` | Sí | Connection string de Neon PostgreSQL. En producción vive en los **secrets de Vercel** — nunca en el repo. Solo la leen `lib/db.ts` (server) y `scripts/apply-schema.ts` (tooling local). |
| `NEXT_PUBLIC_SENTRY_DSN` | No | DSN de Sentry (US-ERR, Sprint 2). **Sin definir, el SDK queda deshabilitado** — cero requests, cero overhead. Config compartida en `lib/sentry.ts`. |
| `NEXT_PUBLIC_PLAUSIBLE_SRC` | No | `src` del snippet **v2** de Plausible (Install → Script), ej. `https://plausible.io/js/script.js`. **Sin definir, el script no se inyecta** y `trackEvent` (`lib/analytics.ts`) es no-op. Si el host no es `plausible.io`, agrégalo al CSP en `next.config.mjs`. |
| `GOOGLE_PLACES_API_KEY` | No | Solo para el script `npm run popularity:compute` (tooling local, **nunca** en runtime). Habilita "Places API (New)" en GCP. Bootstrappea la popularidad de cada comercio (reseñas, sucursales, rating) para el cold-start del ranking. Sin ella el script aborta; la app corre normal. |

Notas:

- El cliente de Neon se inicializa **lazy** (`lib/db.ts`): `next build` evalúa los route modules sin `DATABASE_URL` disponible, así que la conexión se difiere al primer request.
- El service worker solo se registra en producción (`NODE_ENV === "production"`), así que en dev no hay cache que interfiera.

---

## Scripts

| Comando | Descripción |
|---|---|
| `npm run dev` | Dev server con Turbopack |
| `npm run build` | Build de producción |
| `npm run start` | Servir build de producción |
| `npm run lint` | ESLint (flat config, ver `eslint.config.mjs`) |
| `npm test` | Tests unitarios con `node:test` (nativo, cero dependencias) |
| `npm run test:watch` | Tests en modo watch |
| `npm run db:schema` | Aplica `scripts/schema.sql` a la DB de tu `.env.local` |
| `npm run db:seed` | **Destructivo.** DROP + recrea las tablas desde `schema.sql` y carga datos mock. Único modo de propagar cambios de schema (ver abajo). |
| `npm run popularity:compute` | Consulta Google Places y rellena la popularidad de los comercios (`popularity_prior`, `merchant_tier`). Acepta `-- --dry-run` para ver la tabla sin escribir. Requiere `GOOGLE_PLACES_API_KEY`. |
| `npm run swagger:update` | Descarga la última versión de `swagger-ui-dist` y actualiza `public/swagger/` |

### Gestión de la base de datos

Hay dos scripts de base de datos (corren local con Node nativo, nunca en producción):

- `npm run db:schema` aplica `scripts/schema.sql`. **Ojo con el patrón:** un `CREATE TABLE IF NOT EXISTS` **no** altera una tabla que ya existe — agregar una columna *dentro* del `CREATE` no la propaga a Neon. Para columnas nuevas sobre tablas existentes se usa `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` (al final del `.sql`), que **sí** corre idempotente con `db:schema` (así se agregaron `promotions.card_ids` y las columnas de popularidad de `merchants`).
- `npm run db:seed` es **destructivo**: dropea las tablas, las recrea desde `schema.sql` y carga datos mock. Para un reset limpio de toda la estructura sigue siendo la vía más simple (no hay tooling de migración real todavía).

**Failsafe:** si necesitas recrear el schema en una DB nueva: `npm run db:schema`. El script (`scripts/apply-schema.ts`) divide `schema.sql` por `;` y ejecuta cada statement — es tooling local de desarrollo, no corre en producción.

### Popularidad de comercios (cold-start del ranking)

`npm run popularity:compute` (`scripts/compute-merchant-popularity.ts`) bootstrappea la popularidad de cada comercio cuando todavía no hay tráfico propio. Por cada merchant consulta **Google Places API (New)** (`places:searchText`, sesgado a Chile), agrega Σreseñas + nº de sucursales + rating ponderado, normaliza esas señales en escala log **sobre el batch** y escribe en `merchants`: las señales crudas (`places_rating`, `places_ratings_total`, `places_branches`), el `popularity_prior` ∈ [0,1] y un `merchant_tier` 1–5. Guardar las señales crudas permite re-tunear los pesos (definidos en `WEIGHTS` dentro del script) sin volver a pegarle a la API. Corre con `-- --dry-run` para inspeccionar la tabla antes de escribir. Requiere `GOOGLE_PLACES_API_KEY`.

> Los scripts de DB y los tests corren directamente con `node` (TypeScript nativo vía strip-types de Node ≥ 22). No se necesitan transpiladores como `tsx` ni frameworks de testing como `vitest`.

---

## Estructura del proyecto

```
OptiWallet/
├── proxy.ts                      # Middleware (convención Next 16, reemplaza middleware.ts):
│                                 #   redirección server-side / → /app para PWA instalada
├── app/                          # Next.js App Router
│   ├── layout.tsx                # Root layout — fuentes, meta PWA, viewport,
│   │                             #   <ServiceWorkerRegistrar /> + <StandaloneCookieSync />
│   ├── page.tsx                  # Landing page (/) — FAQs, stats dinámicos de /api/stats,
│   │                             #   mockup de teléfono, usePageTransition, <StandaloneRedirect />
│   ├── globals.css               # Design tokens (@theme), layout tokens, animaciones,
│   │                             #   grain overlay, glows, botones, transiciones
│   ├── landing.css               # Estilos exclusivos de la landing (~1200 líneas)
│   ├── icon.svg                  # Favicon SVG
│   ├── error.tsx                 # Error boundary global (US-ERR) — reporta a Sentry + UI branded
│   ├── global-error.tsx          # Boundary de último recurso (root layout roto) — estilos inline
│   ├── app/page.tsx              # Home de la app (/app): feed + search; día vía ?dia= (US-DL);
│   │                             #   onboarding inline si la wallet está vacía
│   ├── app/wallet/page.tsx       # /app/wallet — gestión de tarjetas (ruta real, US-DL)
│   ├── app/comercio/[merchantId]/page.tsx  # /app/comercio/:id — detalle (ruta real, US-DL)
│   ├── api-docs/page.tsx         # Swagger UI self-hosted (US-003)
│   ├── api/                      # 8 Route Handlers (serverless Node.js) → docs/API.md
│   │   ├── banks/route.ts        #   GET /api/banks — todos los bancos
│   │   ├── cards/route.ts        #   GET /api/cards — tarjetas (?bankId=)
│   │   ├── categories/route.ts   #   GET /api/categories — categorías + conteo
│   │   ├── merchants/route.ts    #   GET /api/merchants — búsqueda fuzzy (?q=&category=)
│   │   ├── merchants/[merchantId]/route.ts  # GET — comercio por ID
│   │   ├── promotions/[merchantId]/route.ts # GET — promos activas de un comercio
│   │   ├── recommendations/route.ts  # GET ★ Core: join promos × tarjetas × comercios
│   │   ├── stats/route.ts        #   GET /api/stats — conteos para la landing
│   │   └── openapi.json/route.ts #   GET /api/openapi.json — spec OpenAPI 3.1 (US-003)
│   ├── blog/                     # Páginas internas — usan InnerPageLayout
│   ├── contacto/
│   ├── cookies/
│   ├── prensa/
│   ├── privacidad/
│   ├── roadmap/
│   ├── sobre-nosotros/
│   └── terminos/
│
├── components/
│   ├── layout/                   # Primitivas de layout — dueñas de los safe-areas iOS
│   │   ├── TopBar.tsx            #   Barra superior única (safe-area top / notch / Dynamic Island)
│   │   ├── BottomDock.tsx        #   Dock inferior fijo (safe-area bottom / home indicator)
│   │   └── BackButton.tsx        #   Botón "Volver" estándar
│   ├── Header.tsx                # Topbar de /app: logo, búsqueda y wallet (usa TopBar)
│   ├── DayPicker.tsx             # Selector horizontal de día de la semana (Lun–Dom)
│   ├── TodaysFeed.tsx            # Feed de mejores promos del día (agrupadas por comercio)
│   ├── MerchantSearch.tsx        # Búsqueda de comercios + chips de categoría + resultados
│   ├── MerchantDetail.tsx        # Vista detalle: promo ganadora + alternativas + monto + todas las promos
│   ├── RecommendationCard.tsx    # Card de promo ganadora (gradiente lime) + AlternativeCard
│   ├── WalletSetup.tsx           # Onboarding / gestión de tarjetas — BankRow expandible con cards
│   ├── InstallModal.tsx          # Popup de instalación PWA: tabs Android/iOS + beforeinstallprompt
│   ├── PageTransition.tsx        # Overlay de transición landing ↔ app + usePageTransition hook
│   ├── ServiceWorkerRegistrar.tsx# Monta useServiceWorker (registro del SW, invisible)
│   ├── StandaloneCookieSync.tsx  # Sincroniza cookie ow_standalone en todas las páginas (invisible)
│   ├── StandaloneRedirect.tsx    # Fallback client-side de redirección standalone (solo landing)
│   ├── InnerPageLayout.tsx       # Layout compartido para páginas internas (nav + footer + landing.css)
│   └── ComingSoon.tsx            # Placeholder para secciones WIP (ícono + desc + mailto)
│
├── lib/
│   ├── types.ts                  # Tipos de dominio (Bank, Card, Merchant, Promotion, Recommendation)
│   ├── db.ts                     # Cliente SQL de Neon (lazy-init, solo server, NeonQueryFunction)
│   ├── validate.ts               # Validación de IDs para la API (/^[A-Za-z0-9_.-]{1,64}$/)
│   ├── api-client.ts             # Tipos Api* (snake_case) + fetch wrappers de los 8 endpoints
│   ├── use-wallet.ts             # Hook localStorage para tarjetas del usuario (hydrated, initiallyEmpty)
│   ├── standalone.ts             # Detección de PWA instalada + cookie ow_standalone + auto-reparación Android
│   ├── format.ts                 # Fechas (es-CL), CLP, días de semana, modalidad, toISODateLocal
│   ├── recommendations.ts        # Motor de cálculo y ranking de ahorros, topes y promociones apilables
│   ├── analytics.ts              # Wrapper de Plausible + eventos de onboarding (US-ANA)
│   ├── sentry.ts                 # Opciones compartidas de Sentry — no-op sin DSN (US-ERR)
│   ├── openapi.ts                # Spec OpenAPI 3.1 de la API, mantenida a mano (US-003)
│   └── hooks/
│       ├── use-api.ts            # useApiQuery genérico + hooks tipados (useBanks, useCards,
│       │                         #   useCategories, useMerchants, useRecommendations,
│       │                         #   usePromotions, useMerchantFromApi)
│       ├── use-today.ts          # "Hoy" auto-refrescante + effectiveDateFor + parseDiaParam (US-DL)
│       └── use-service-worker.ts # Registro del SW (solo producción, post-load, updatefound listener)
│
├── scripts/                      # Tooling de base de datos
│   ├── schema.sql                # DDL PostgreSQL — fuente de verdad del schema (5 tablas + 4 índices)
│   ├── apply-schema.ts           # Aplica schema.sql a Neon (npm run db:schema)
│   ├── seed.ts                   # Reset destructivo + datos mock (npm run db:seed)
│   └── compute-merchant-popularity.ts  # Popularidad de comercios vía Google Places (npm run popularity:compute)
│
├── public/
│   ├── manifest.json             # PWA manifest (standalone, portrait, es-CL, start_url: /app)
│   ├── sw.js                     # Service worker — offline support (3 caches, 2 estrategias)
│   ├── icon.svg                  # Ícono SVG
│   ├── icon-192.png              # Ícono PWA 192×192
│   ├── icon-512.png              # Ícono PWA 512×512
│   ├── icon-maskable.png         # Ícono PWA maskable 512×512
│   └── swagger/                  # Swagger UI self-hosted (swagger-ui-dist@5.32.6, US-003)
│
├── docs/                         # Documentación técnica detallada
│   ├── ARCHITECTURE.md           # Arquitectura, routing, PWA, SW, data layer, componentes
│   ├── API.md                    # Referencia de los 8 endpoints
│   └── SECURITY.md               # Postura de seguridad + recomendaciones
│
├── OptiWallet/                   # Reportes de auditoría
│   ├── audit-report.md           # Code audit 2026-06-10
│   └── security-audit-2026-06-11.md  # Security audit 2026-06-11
│
├── instrumentation.ts            # Hook de instrumentación Next — carga Sentry por runtime (US-ERR)
├── instrumentation-client.ts     # Init de Sentry en el browser (US-ERR)
├── sentry.server.config.ts       # Init de Sentry runtime Node (US-ERR)
├── sentry.edge.config.ts         # Init de Sentry runtime Edge (US-ERR)
├── TODO.md                       # Placeholders y pendientes operativos
├── next.config.mjs               # Security headers (CSP con Plausible/Sentry, HSTS…) + poweredByHeader off
├── vercel.json                   # Config de deploy — pin a región gru1
├── eslint.config.mjs             # ESLint 10 flat config (con shims de compat para plugins legacy)
├── tsconfig.json                 # TypeScript config
├── postcss.config.mjs            # PostCSS — plugin @tailwindcss/postcss
├── .env.example                  # Template de variables de entorno
├── .gitignore                    # Ignores estándar + .env.local
└── legacy/                       # Prototipo HTML original (referencia histórica)
```

---

## Arquitectura (resumen)

> Versión completa con diagramas de flujo en [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

### Routing

| Ruta | Tipo | Propósito |
|---|---|---|
| `/` | Client component | Landing page de marketing (+ `InstallModal` con instrucciones Android/iOS) |
| `/app` | Client component | Home de la app: feed del día + búsqueda. Día seleccionado vía `?dia=0..6` (US-DL) |
| `/app/wallet` | Client component | Gestión de tarjetas (deep-linkable) |
| `/app/comercio/[merchantId]` | Client component | Detalle de comercio (deep-linkable, acepta `?dia=`) |
| `/api-docs` | Client component | Swagger UI self-hosted sobre `/api/openapi.json` (US-003) |
| `/blog`, `/contacto`, etc. | Server components | Páginas internas con `InnerPageLayout` |
| `/api/*` | Route Handlers (serverless Node.js) | Queries directas a Neon PostgreSQL (+ `/api/openapi.json` estático) |

> **US-DL (Sprint 2):** las vistas de `/app` que antes eran estado React (`view`) son ahora rutas reales del App Router — URLs compartibles, back del browser funcional. El estado compartido entre rutas (wallet, "hoy") vive en `useWallet` y `lib/hooks/use-today.ts`. El onboarding sigue siendo estado local de `/app` (condición de wallet vacía, no una vista navegable).

### Redirección standalone (PWA instalada)

Cuando el usuario instala la PWA y la abre, debe aterrizar en `/app` y no en la landing. Tres piezas cooperan (detalle en `lib/standalone.ts` y [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)):

1. **`StandaloneCookieSync`** (root layout) — setea la cookie `ow_standalone=1` cuando detecta modo standalone, y la borra en navegador normal (auto-reparación para Android, donde la PWA comparte cookies con Chrome).
2. **`proxy.ts`** (middleware, solo matcher `/`) — si la cookie existe, redirige `/` → `/app` en el edge, sin flash de landing.
3. **`StandaloneRedirect`** (landing) — fallback client-side para la primera visita (cookie aún no existe) y para modo offline.

### Wallet del usuario

Vive en `localStorage` bajo `optiwallet:cards` como array de IDs de tarjeta. El hook `useWallet` expone `hydrated` (evita mismatches SSR) e `initiallyEmpty` (fija el flujo de onboarding una sola vez). **No hay cuentas, ni sync entre dispositivos, ni datos del usuario en el servidor.**

### Capa de datos

Todos los datos viven en **Neon PostgreSQL** — no hay archivos de datos estáticos. Los Route Handlers usan el cliente lazy de `lib/db.ts` con queries 100% parametrizadas (tagged templates). La API es **pública y de solo lectura** (solo `GET`/`SELECT`).

**Tablas:**

| Tabla | Contenido |
|---|---|
| `banks` | Bancos e instituciones; `available` indica si tiene promos cargadas |
| `cards` | Productos de tarjeta por banco (`credit` / `debit` / `prepaid`) |
| `merchant_categories` | Categorías de comercios con emoji |
| `merchants` | Comercios con aliases para búsqueda fuzzy. Lleva además las señales de popularidad del cold-start del ranking (`places_rating`, `places_ratings_total`, `places_branches`, `popularity_prior` 0–1, `merchant_tier` 1–5, `popularity_updated_at`), pobladas por `npm run popularity:compute`. No se exponen en la API pública. |
| `promotions` | Promociones con días, topes, monto mínimo de compra, fechas, modalidad y trazabilidad (`source`, `verified_at`). Índices en `merchant_id`, `bank_id`, `active` y `days_of_week` (GIN). La API filtra promos vencidas por `end_date`. |

**Convenciones de datos:**

- **IDs:** slugs descriptivos kebab-case, no UUIDs (ej. `bci`, `bci-credit`, `comida-rapida`, `papa-johns`, `bci-kfc-lunes`). Facilita debugging y referencia cruzada manual. La API valida formato: `/^[A-Za-z0-9_.-]{1,64}$/` (`lib/validate.ts`).
- **Días de la semana (`days_of_week`):** array de enteros, `0 = domingo` … `6 = sábado`. Array vacío `{}` = aplica **todos los días**.
- **Modalidad (`modality`):** `presencial` | `online` | `both`.
- **Tipos de tarjeta (`card_types`):** array con `credit` y/o `debit`.
- **Descuentos (`discount`):** entero 1–100 (porcentaje, con CHECK en DB).
- **Topes (`cap`):** descuento máximo en CLP; `null` = sin tope.

### Endpoints API

> Referencia completa con ejemplos de request/response en [`docs/API.md`](docs/API.md).

| Endpoint | Params | Descripción |
|---|---|---|
| `GET /api/banks` | — | Todos los bancos |
| `GET /api/cards` | `?bankId=` | Tarjetas, opcionalmente por banco |
| `GET /api/categories` | — | Categorías con conteo de comercios |
| `GET /api/merchants` | `?q=&category=` | Búsqueda fuzzy en nombre y aliases (máx. 50) |
| `GET /api/merchants/[id]` | — | Un comercio con su categoría |
| `GET /api/promotions/[merchantId]` | — | Promos activas de un comercio |
| `GET /api/recommendations` | `cardIds[]=&date=&merchantId=` | **Core:** join promos × tarjetas × comercios, filtra por día y vigencia |
| `GET /api/stats` | — | Conteos de promos, comercios y bancos (landing) |

---

## Seguridad

> Detalle completo en [`docs/SECURITY.md`](docs/SECURITY.md) y en el [audit 2026-06-11](OptiWallet/security-audit-2026-06-11.md).

- **Security headers** en `next.config.mjs`: CSP, HSTS, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`. `X-Powered-By` deshabilitado.
- **CSP — orígenes externos permitidos (Sprint 2):** `https://plausible.io` (script + eventos de analytics) y `https://*.ingest.*.sentry.io` (connect-src para reportes de error). Swagger UI es self-hosted en `public/swagger/` precisamente para no abrir la CSP a CDNs.
- **SQL:** queries parametrizadas en todos los routes (tagged templates de Neon); escape de comodines LIKE en búsqueda; columnas explícitas en todos los SELECT.
- **Validación de input:** todos los IDs que llegan por query/path se validan con `lib/validate.ts` antes de tocar la base → `400` ante input malformado.
- **Errores:** los 500 devuelven `{"error":"Error interno"}` genérico; el detalle va a los logs de Vercel, nunca al cliente.
- **Secrets:** `DATABASE_URL` solo en secrets de Vercel / `.env.local` (gitignored). Historial git limpio.

---

## Design system

Tokens definidos en `globals.css` bajo `@theme {}` (Tailwind 4 CSS-first):

| Token | Valor | Uso |
|---|---|---|
| `--bg` | `#0b0d0c` | Fondo principal |
| `--bg-2` | `#13161a` | Superficies elevadas |
| `--bg-3` | `#1a1f1c` | Superficies más elevadas (avatares, badges) |
| `--ink` | `#f5f1e8` | Texto principal (blanco cálido) |
| `--ink-dim` | `#9a958a` | Texto secundario |
| `--lime` | `#d4ff3a` | Acento primario — CTAs, selecciones, ganadora |
| `--lime-deep` | `#a8d400` | Variante profunda de lime (gradientes) |
| `--copper` | `#d67846` | Acento secundario — labels, advertencias, vigencias |
| `--plum` | `#4a2d5a` | Glows decorativos |
| `--line` | `rgba(245,241,232,0.12)` | Bordes sutiles |
| `--line-strong` | `rgba(245,241,232,0.28)` | Bordes activos / hover |

**Fuentes:** Fraunces (serif, títulos), Sora (sans, cuerpo), JetBrains Mono (monospace, labels técnicas). Self-hosted vía `next/font` — no se llama a Google Fonts en runtime.

**Layout tokens:** los safe-areas de iOS (notch / Dynamic Island / home indicator) son responsabilidad exclusiva de las primitivas `TopBar` y `BottomDock`, alimentadas por tokens (`--topbar-pad-top`, `--dock-pad-bottom`, `--page-px`) en `globals.css`. Ninguna pantalla duplica `env(safe-area-inset-*)` por su cuenta.

**CSS strategy:** Tailwind utilities para la app; vanilla CSS scoped bajo `.landing-root` para la landing — nunca mezclar.

**Decorativos:** grain overlay global (`body::before` con SVG feTurbulence), glows radiales (`.glow-lime`, `.glow-plum`, `.glow-copper`), pulse dot, staggered children fadeUp.

---

## PWA

- `manifest.json`: standalone, portrait, tema `#0b0d0c`, lang `es-CL`, `start_url: "/app"`.
- **Service worker** (`public/sw.js`, **v2** desde Sprint 2): 3 caches (`optiwallet-v2`, `optiwallet-static-v2`, `optiwallet-api-v2`); precache de shell (/, /app, /app/wallet, manifest, íconos); network-first para API y HTML; cache-first con revalidación en background para assets estáticos. Offline, los deep links `/app/*` caen al shell cacheado de `/app` (no a la landing). Solo se registra en producción. Detalle en [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
- **Instalación guiada**: `InstallModal` en la landing — popup in-page con tabs Android/iOS, autodetección de plataforma y soporte de `beforeinstallprompt` (instalación con un toque en Android Chrome).
- **Redirección standalone**: la PWA instalada abre directo en `/app` (ver Arquitectura).
- Root layout: `appleWebApp: { capable: true, statusBarStyle: "black-translucent" }`.
- Viewport: no-scale (`userScalable: false`, `viewportFit: cover`).
- Íconos: `icon-192.png`, `icon-512.png`, `icon-maskable.png`.

---

## Limitaciones de la beta

- Cobertura de bancos y comercios parcial — los bancos sin promos cargadas aparecen como "próximamente".
- Sin cuentas ni sync — la wallet es `localStorage` only.
- Soporte offline básico: el SW sirve cache cuando no hay red, pero no hay UI de "estás offline" ni banner de actualización de versión (planificado).
- Varias páginas internas son placeholders (`ComingSoon`) — inventario completo en [`TODO.md`](TODO.md).
- **Sentry** y **Plausible** están integrados y se activan por env var: `NEXT_PUBLIC_SENTRY_DSN` (DSN del proyecto) y `NEXT_PUBLIC_PLAUSIBLE_SRC` (el `src` del snippet v2 de Plausible). Sin la var respectiva, cada uno queda inerte. Walkthrough de claves en [`docs/ADMIN.md`](docs/ADMIN.md#inventario-y-rotación-de-claves).
- Sin rate limiting en la API (mitigado por cache de edge; recomendación: Vercel WAF — ver `docs/SECURITY.md`).
- La fecha en `/app` se auto-actualiza al cambiar el día (focus/visibilitychange + interval 60s), pero una PWA que quede dormida muchos días puede mostrar datos stale hasta recibir foco.

---

v1.0.0-beta.1 · Hecho en Santiago 🇨🇱
