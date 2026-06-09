# OptiWallet

**Te dice con qué tarjeta pagar para ahorrar más, en cada comercio de Chile.**

OptiWallet cruza las promociones de bancos chilenos y recomienda la mejor tarjeta según el día y el comercio. Sin datos bancarios, sin cuentas, sin descargas — funciona como PWA directo desde el navegador.

> v0.1.0-beta · Solo para Chile 🇨🇱 · **Producción:** [optiwallet.vercel.app](https://optiwallet.vercel.app)

---

## Stack

| Capa | Tecnología | Versión |
|---|---|---|
| Framework | Next.js (App Router, Turbopack) | 16.2.4 |
| UI | React + TypeScript | 19.2 + 6.0 |
| Estilos | Tailwind CSS 4 + vanilla CSS | 4.2.4 |
| Base de datos | Neon PostgreSQL (serverless) | @neondatabase/serverless ^1.1.0 |
| Deploy | Vercel (serverless Node.js, región `gru1`) | — |
| Tipografía | Fraunces · Sora · JetBrains Mono | Google Fonts |
| PWA | manifest.json + Apple Web App meta | — |

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
| `DATABASE_URL` | Sí | Connection string de Neon PostgreSQL |

---

## Estructura del proyecto

```
OptiWallet/
├── app/                          # Next.js App Router
│   ├── layout.tsx                # Root layout — fuentes, meta PWA, viewport
│   ├── page.tsx                  # Landing page (/)
│   ├── globals.css               # Design tokens, animaciones, utilidades globales
│   ├── landing.css               # Estilos exclusivos de la landing (~1200 líneas)
│   ├── app/page.tsx              # Web app principal (/app)
│   ├── api/                      # 8 Route Handlers (serverless Node.js)
│   │   ├── banks/route.ts
│   │   ├── cards/route.ts
│   │   ├── categories/route.ts
│   │   ├── merchants/route.ts
│   │   ├── merchants/[merchantId]/route.ts
│   │   ├── promotions/[merchantId]/route.ts
│   │   ├── recommendations/route.ts
│   │   └── stats/route.ts
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
│   ├── Header.tsx                # Topbar sticky con logo, búsqueda y wallet
│   ├── DayPicker.tsx             # Selector horizontal de día de la semana
│   ├── TodaysFeed.tsx            # Feed de mejores promos del día
│   ├── MerchantSearch.tsx        # Búsqueda de comercios + chips de categoría
│   ├── MerchantDetail.tsx        # Vista detalle con promo ganadora + alternativas
│   ├── RecommendationCard.tsx    # Card de promo ganadora y AlternativeCard
│   ├── WalletSetup.tsx           # Onboarding / gestión de tarjetas del usuario
│   ├── PageTransition.tsx        # Overlay de transición landing ↔ app
│   ├── InnerPageLayout.tsx       # Layout compartido para páginas internas
│   └── ComingSoon.tsx            # Placeholder para secciones WIP
│
├── lib/
│   ├── types.ts                  # Tipos de dominio (Bank, Card, Merchant, Promotion…)
│   ├── db.ts                     # Cliente SQL de Neon (lazy-initialized, solo server)
│   ├── api-client.ts             # Fetch wrappers para todos los endpoints
│   ├── use-wallet.ts             # Hook localStorage para tarjetas del usuario
│   ├── format.ts                 # Formateo de fechas y CLP en español chileno
│   └── hooks/
│       └── use-api.ts            # Hooks React: useBanks, useCards, useMerchants…
│
├── scripts/                      # Failsafe de base de datos
│   ├── schema.sql                # DDL PostgreSQL — fuente de verdad del schema
│   └── apply-schema.ts           # Aplica schema.sql a Neon (npm run db:schema)
│
├── public/
│   └── manifest.json             # PWA manifest
│
├── vercel.json                   # Config de deploy — pin a región gru1
│
└── legacy/                       # Prototipo HTML original (referencia)
```

---

## Arquitectura

### Routing

El proyecto tiene dos superficies:

| Ruta | Tipo | Propósito |
|---|---|---|
| `/` | Client component | Landing page de marketing |
| `/app` | Client component | Web app (vistas manejadas por estado React) |
| `/blog`, `/contacto`, `/privacidad`, etc. | Server components | Páginas internas con `InnerPageLayout` |
| `/api/*` | Route Handlers (serverless Node.js) | Queries directas a Neon PostgreSQL |

La navegación entre la landing y la app usa un overlay de transición (`PageTransition.tsx`) con logo y shimmer bar. Las vistas dentro de `/app` (`home`, `merchant`, `wallet`) se controlan por estado React, no por URL.

### Wallet del usuario

Vive en `localStorage` bajo `optiwallet:cards` como un array de IDs de tarjeta. El hook `useWallet` expone un flag `hydrated` para evitar mismatches de SSR. No hay cuentas de usuario ni sync entre dispositivos.

### Capa de datos

Todos los datos viven en **Neon PostgreSQL** — no hay archivos de datos estáticos en el codebase. Los Route Handlers se ejecutan de manera serverless usando el cliente lazy de `lib/db.ts`.

**Tablas:**

| Tabla | Contenido |
|---|---|
| `banks` | Bancos e instituciones; campo `available` indica si tiene promos cargadas |
| `cards` | Productos de tarjeta por banco (`credit` / `debit`) |
| `merchant_categories` | Categorías de comercios con emoji |
| `merchants` | Comercios con aliases para búsqueda fuzzy |
| `promotions` | Promociones activas con días, topes, fechas y modalidad |

**Convenciones de Datos:**

- **IDs:** Se utilizan slugs descriptivos en kebab-case en lugar de UUIDs o IDs numéricos (ej. `bci`, `bci-credit`, `comida-rapida`, `papa-johns`, `bci-kfc-lunes`). Esto facilita el debugging y la referencia cruzada manual.
- **Días de la semana (`days_of_week`):** Array de enteros donde `0 = Domingo`, `1 = Lunes`, ..., `6 = Sábado`. Un array vacío `{}` significa que la promoción aplica **todos los días**.
- **Modalidad (`modality`):** Acepta los valores `presencial`, `online`, o `both`.
- **Tipos de tarjeta (`card_types`):** Array de strings que especifica si la promoción aplica a crédito, débito o ambas. Valores permitidos: `credit`, `debit`.
- **Descuentos (`discount`):** Entero del 1 al 100 que representa el porcentaje de descuento.
- **Topes (`cap`):** Entero que representa el descuento máximo en CLP. Puede ser `null` si no hay tope.

### Endpoints API

| Endpoint | Params | Descripción |
|---|---|---|
| `GET /api/banks` | — | Todos los bancos |
| `GET /api/cards` | `?bankId=` | Tarjetas, opcionalmente por banco |
| `GET /api/categories` | — | Categorías de comercios |
| `GET /api/merchants` | `?q=&category=` | Búsqueda fuzzy en nombre y aliases |
| `GET /api/merchants/[id]` | — | Un comercio con su categoría |
| `GET /api/promotions/[merchantId]` | — | Promos activas de un comercio |
| `GET /api/recommendations` | `cardIds[]=&date=&merchantId=` | **Core:** join promos × tarjetas × comercios, filtra por día y fecha |
| `GET /api/stats` | — | Conteos de promos, comercios y bancos (para la landing) |

---

## Design system

Tokens definidos en `globals.css` bajo `@theme {}` (Tailwind 4 CSS-first):

| Token | Valor | Uso |
|---|---|---|
| `--bg` | `#0b0d0c` | Fondo principal |
| `--bg-2` | `#13161a` | Superficies elevadas |
| `--ink` | `#f5f1e8` | Texto principal (blanco cálido) |
| `--ink-dim` | `#9a958a` | Texto secundario |
| `--lime` | `#d4ff3a` | Acento primario — CTAs, selecciones, ganadora |
| `--copper` | `#d67846` | Acento secundario — labels, advertencias |
| `--plum` | `#4a2d5a` | Glows decorativos |
| `--line` | `rgba(245,241,232,0.12)` | Bordes sutiles |

**Fuentes:** Fraunces (serif, títulos), Sora (sans, cuerpo), JetBrains Mono (monospace, labels técnicas).

**CSS strategy:** Tailwind utilities para la app; vanilla CSS scoped bajo `.landing-root` para la landing — nunca mezclar.

---

## Scripts

| Comando | Descripción |
|---|---|
| `npm run dev` | Dev server con Turbopack |
| `npm run build` | Build de producción |
| `npm run start` | Servir build de producción |
| `npm run lint` | ESLint |
| `npm run db:schema` | Aplicar `scripts/schema.sql` a Neon (requiere `.env.local`) |

### Gestión de la base de datos

Los datos se administran directamente desde la **consola de Neon**. No hay scripts de seed — la migración inicial ya fue completada.

**Failsafe:** Si necesitas recrear el schema en un DB nuevo:

```bash
npm run db:schema
```

Esto aplica `scripts/schema.sql` contra la DB en tu `DATABASE_URL`.

---

## PWA

- `manifest.json` en `/public`: standalone, portrait, tema `#0b0d0c`, lang `es-CL`
- Root layout: `appleWebApp: { capable: true, statusBarStyle: "black-translucent" }`
- Viewport: no-scale (`userScalable: false`, `viewportFit: cover`)
- CSS respeta safe areas de iOS con `env(safe-area-inset-*)`

> **Nota:** El manifest referencia `icon-192.png`, `icon-512.png`, e `icon-maskable.png` que aún no están en `/public`. Solo existe `icon.svg`.

---

## Limitaciones de la beta

- La cobertura de bancos y comercios es parcial — los bancos sin promos cargadas aparecen como "próximamente" en la app
- Sin cuentas ni sync — wallet es `localStorage` only
- Sin service worker — no hay soporte offline real
- Sin deep-linking dentro de `/app` — las vistas son estado React, no URL
- Varias páginas internas son placeholders (`ComingSoon`)
- Sin error boundaries globales

---

v0.1.0-beta · Hecho en Santiago 🇨🇱
