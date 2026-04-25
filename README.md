# OptiWallet

**Te dice con qué tarjeta pagar para ahorrar más, en cada comercio de Chile.**

OptiWallet cruza las promociones y descuentos de bancos y tarjetas de crédito chilenos, y recomienda la mejor tarjeta según el día y el comercio. Sin datos bancarios, sin cuentas, sin descargas — funciona como PWA directo desde el navegador.

> Beta · Solo para Chile 🇨🇱

---

## Stack

| Capa | Tecnología | Versión |
|------|------------|---------|
| Framework | Next.js (App Router, Turbopack) | 16.2.4 |
| UI | React + TypeScript | 19.2 + 6.0 |
| Estilos | Tailwind CSS + vanilla CSS | 4.2.4 |
| Lint | ESLint + eslint-config-next | 10.2 + 16.2.4 |
| Tipografía | Fraunces · Sora · JetBrains Mono | Google Fonts |
| Persistencia | `localStorage` (sin backend) | — |
| Deploy | Vercel | — |

## Correr localmente

```bash
npm install
npm run dev
```

Abre [localhost:3000](http://localhost:3000). La landing está en `/`, la app en `/app`.

## Estructura del proyecto

```
app/
├── layout.tsx              Root layout — fuentes, meta PWA, viewport
├── page.tsx                Landing page con transición al app
├── globals.css             Design tokens, animaciones, utilidades
├── landing.css             Estilos exclusivos de la landing
├── icon.svg                Favicon
├── app/
│   └── page.tsx            Web app principal
├── blog/                   Páginas internas — usan InnerPageLayout
├── contacto/
├── cookies/
├── prensa/
├── privacidad/
├── roadmap/
├── sobre-nosotros/
└── terminos/

components/
├── PageTransition.tsx      Overlay de transición landing ↔ app
├── Header.tsx              Header de la app con acceso a wallet
├── DayPicker.tsx           Selector horizontal de día de la semana
├── TodaysFeed.tsx          Feed de promos del día seleccionado
├── MerchantSearch.tsx      Búsqueda de comercios + chips de categoría
├── MerchantDetail.tsx      Vista detalle con recomendación ganadora
├── RecommendationCard.tsx  Card de promo ganadora + alternativas
├── WalletSetup.tsx         Onboarding / gestión de tarjetas
├── InnerPageLayout.tsx     Layout compartido para páginas internas
└── ComingSoon.tsx          Placeholder reutilizable para páginas WIP

lib/
├── types.ts                Tipos de dominio (Bank, Card, Promotion, etc.)
├── format.ts               Formateo de fechas y CLP en español
├── use-wallet.ts           Hook de localStorage para tarjetas del usuario
├── recommendation-engine.ts Motor de recomendación (función pura)
└── data/
    ├── banks.ts            14 bancos (BCI activo, resto próximamente)
    ├── cards.ts            Productos de tarjeta por banco
    ├── categories.ts       Categorías de comercios
    ├── merchants.ts        ~25 comercios
    └── promotions.ts       25 promos verificadas (BCI, abril 2026)
```

## Arquitectura

### Motor de recomendación

`recommendation-engine.ts` es una función pura: recibe `cardIds`, `merchantId`, `date` y `amount`, devuelve recomendaciones ordenadas por descuento. No toca DOM, fetch ni storage. Cuando exista backend, se mueve al servidor sin cambios.

### Wallet del usuario

Vive en `localStorage` bajo `optiwallet:cards` como un array de IDs de tarjeta. El hook `useWallet` expone un flag `hydrated` para evitar mismatches de SSR.

### Datos

Todas las promos provienen del documento de beneficios BCI de abril 2026. Los tipos en `lib/types.ts` están modelados para mapear directamente a tablas SQL cuando se agregue un backend.

### Transiciones

La navegación entre la landing (`/`) y la app (`/app`) usa un overlay con el logo y un shimmer bar. El app page recibe una animación de entrada escalonada. Las páginas internas tienen un fade-up sutil al montar.

## Design system

La paleta y tokens viven en `globals.css`:

| Token | Valor | Uso |
|-------|-------|-----|
| `--bg` | `#0b0d0c` | Fondo principal |
| `--ink` | `#f5f1e8` | Texto principal |
| `--lime` | `#d4ff3a` | Acento primario |
| `--copper` | `#d67846` | Acento secundario, labels |
| `--plum` | `#4a2d5a` | Glows decorativos |
| `--line` | `rgba(245,241,232,0.12)` | Bordes sutiles |

Fuentes: **Fraunces** (serif, títulos), **Sora** (sans, cuerpo), **JetBrains Mono** (monospace, labels técnicas).

## Scripts

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Dev server con Turbopack |
| `npm run build` | Build de producción |
| `npm run start` | Servir build de producción |
| `npm run lint` | ESLint |

## PWA

- `manifest.json` en `/public` con íconos configurados
- `layout.tsx` declara `appleWebApp: { capable: true }` y `viewport-fit: cover`
- CSS respeta safe areas de iOS con `env(safe-area-inset-*)`
- Grain texture overlay para textura visual premium

## Limitaciones de la beta

- Sin backend — datos estáticos curados manualmente
- Sin cuentas, login ni sync entre dispositivos
- Solo BCI tiene promos activas; los otros 13 bancos aparecen como "próximamente"
- No se solicitan números de tarjeta, clave ni RUT
- Sin service worker offline (pendiente)

---

v0.1.0-beta · Hecho en Santiago 🇨🇱
