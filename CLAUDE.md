# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev                  # Dev server (Turbopack)
npm run build                # Production build
npm run lint                 # ESLint (flat config)
npm test                     # All unit tests
npm run test:watch           # Tests in watch mode
npm run test:coverage        # All unit tests + native coverage report
node --test tests/validate.test.ts  # Single test file

npm run db:schema            # Apply schema.sql to Neon DB (idempotent, non-destructive)
npm run db:seed              # DESTRUCTIVE: drop + recreate tables + load mock data
npm run popularity:compute   # Bootstrap merchant popularity via Google Places API (requires GOOGLE_PLACES_API_KEY)
npm run admin:create         # Create first admin (CLI — only way to bootstrap)
npm run admin:encrypt-totp   # Migrate plaintext TOTP secrets to AES-256-GCM (idempotent)
```

Tests run with Node's native `node:test` + `node:assert` — no Jest, no Vitest. TypeScript runs natively via Node strip-types (requires Node ≥ 22). No transpiler needed.

## Environment Variables

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | Yes | Neon PostgreSQL connection string. Only read by `lib/db.ts` and scripts — never exposed to client. |
| `ADMIN_SESSION_SECRET` | For admin panel | HMAC-SHA256 signing key. Rotating this invalidates all active sessions. |
| `ADMIN_TOTP_ENC_KEY` | Recommended | AES-256-GCM key for TOTP secrets at rest. Must match between local (`admin:create`) and Vercel. Rotating orphans all stored TOTP secrets. |
| `NEXT_PUBLIC_SENTRY_DSN` | No | Sentry disabled entirely if absent. |
| `NEXT_PUBLIC_PLAUSIBLE_SRC` | No | Plausible v2 script `src`. If absent, `analytics.ts` is a no-op. If host ≠ `plausible.io`, add it to CSP in `next.config.mjs`. |
| `GOOGLE_PLACES_API_KEY` | No | Only for `popularity:compute` script — never in runtime. |

Copy `.env.example` → `.env.local` to start. `DATABASE_URL` is the only required variable for running the app locally.

## Architecture

### Tech stack
- **Next.js 16 App Router** — deployed to Vercel (region `gru1`)
- **Neon PostgreSQL** via `@neondatabase/serverless` — no ORM, raw parameterized tagged template literals
- **No global state library** — React hooks only (`useWallet` + `useApiQuery` + `useToday`)
- **PWA** — `manifest.json` + vanilla `public/sw.js` (no build step) + multi-piece standalone redirect system

### Routing

All app views (`/app`, `/app/wallet`, `/app/comercio/[merchantId]`) are **real App Router routes** with deep-linkable URLs and working browser back. The selected day travels as `?dia=0..6` (0=Sunday). The wallet re-hydrates from `localStorage` in each route rather than being shared in a store.

Pages under `/blog`, `/contacto`, `/cookies`, etc. are server components using `InnerPageLayout`.

### Middleware: `proxy.ts` (not `middleware.ts`)

Next.js 16 uses `proxy.ts` as the middleware convention — `middleware.ts` is deprecated in this version. It handles three concerns in order:

1. **Maintenance mode**: for all public routes (not `/admin*`, not `/api/admin*`, not `/mantencion`), checks `app_settings.maintenance_mode` in the DB (cached 30s in memory via `lib/maintenance.ts`). If active → `307 /mantencion`. Fails open: if the DB doesn’t respond, traffic is not blocked.
2. **Admin guard**: for `/admin/*` (except `/admin/login`), validates the HMAC-signed `ow_admin_session` cookie
3. **PWA redirect**: if cookie `ow_standalone=1` is present on `/`, redirects to `/app`

### Database layer

`lib/db.ts` exports a **lazy-initialized** `sql` tagged template function. The client is not created at module load time — `next build` evaluates route modules without `DATABASE_URL` available, so initialization is deferred to the first actual request.

Schema source of truth: `scripts/schema.sql`. **Critical gotcha with schema changes:**

- `CREATE TABLE IF NOT EXISTS` does NOT alter existing tables. Adding a column inside the `CREATE` won't propagate to a live DB.
- To add a new column to an existing table, append `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` at the bottom of `schema.sql`. This runs idempotently via `db:schema`. (This is how `promotions.card_ids` and all `merchants` popularity columns were added.)
- `db:seed` is the nuclear option: drops all tables, recreates from `schema.sql`, loads mock data.

### Data conventions

- **IDs**: kebab-case slugs (e.g. `bci`, `bci-credit`, `papa-johns`) — not UUIDs. Validated by `lib/validate.ts` (`/^[A-Za-z0-9_.-]{1,64}$/`).
- **`days_of_week`**: integer array where 0=Sunday…6=Saturday. **Empty array `{}` means all days** (not zero days).
- **`card_ids` on promotions**: if non-empty, the promo applies ONLY to those exact card IDs ("tarjeta única"), and `card_types` is ignored. If empty, applies to any card of the matching bank whose type is in `card_types`. This logic lives as a pure function `promoAppliesToCard` in `lib/recommendations.ts` and mirrors the JOIN condition in `/api/recommendations`.
- **Date handling**: always use `toISODateLocal` from `lib/format.ts` instead of `toISOString()`. In Chile (UTC-3/UTC-4), `toISOString()` rolls over to tomorrow after ~21:00.

### PWA standalone redirect (three-piece system)

When the PWA is installed and opened, it must land on `/app`, not the marketing landing. Three pieces cooperate:

1. **`StandaloneCookieSync`** (root layout, runs on every page) — detects standalone mode via `matchMedia("(display-mode: standalone)")` + `navigator.standalone`, sets/clears the `ow_standalone=1` cookie. Also acts as self-repair for Android where the PWA and Chrome share cookies.
2. **`proxy.ts`** (Edge middleware, matcher `/`) — if `ow_standalone=1` exists, redirects to `/app` server-side with no flash.
3. **`StandaloneRedirect`** (landing page, client-side) — fallback for first visit (cookie not yet set) and offline (SW serves cached landing without middleware).

### Recommendations engine

`GET /api/recommendations` is the core product endpoint. It JOINs promotions × cards × merchants, filtering by `card.id IN cardIds`, date range, and `dayOfWeek ∈ days_of_week`. Business logic for savings calculation and ranking lives in `lib/recommendations.ts` as pure functions:
- `calculateSavings` — applies discount %, cap, and min_purchase
- `rankRecommendations` — sorts by percentage by default, switches to real CLP savings when the user enters a purchase amount (a card with lower % but higher cap can win at large amounts)
- `calculateStackedSavings` — cascading savings for stackable promos

### Admin panel

Protected subsite at `/admin` with two-factor auth (bcrypt password + TOTP via `otpauth`). First admin is created with `npm run admin:create` (CLI only — no web setup page). Subsequent admins are created from within the authenticated panel at `/admin/users/new`.

Auth flow: `POST /api/admin/auth/login` → issues pending-MFA token (5 min) → `POST /api/admin/auth/verify-totp` → issues session cookie (8h, HMAC-SHA256, HttpOnly, SameSite=Strict).

All admin API routes call `requireAdmin()` (`lib/admin-guard.ts`) which validates the cookie AND re-queries the DB — a deleted or TOTP-reset admin loses access immediately.

TOTP secrets are stored AES-256-GCM encrypted in the DB (`lib/admin-crypto.ts`). The `ADMIN_TOTP_ENC_KEY` must be identical between the machine running `admin:create` and the Vercel environment.

### CSS strategy

- **App** (`/app`): Tailwind 4 utilities (CSS-first, configured in `globals.css` via `@theme`)
- **Landing** (`/`): vanilla CSS scoped under `.landing-root` in `landing.css` (~1200 lines)
- **Never mix** the two approaches

**Safe area rule**: `env(safe-area-inset-*)` is handled exclusively by `components/layout/TopBar.tsx` and `components/layout/BottomDock.tsx`. No other component should reference safe area insets directly.

### Service worker

`public/sw.js` is plain JavaScript (no build step). Only registers in production (`NODE_ENV === "production"`). Cache name is versioned (`optiwallet-v2`) — bump the version in `sw.js` when changing precache contents. Strategies: network-first for API and HTML, cache-first with background revalidation for static assets. Offline fallback for `/app/*` deep links serves the cached `/app` shell.

### `server-only` boundaries

`lib/db.ts`, `lib/admin-auth.ts`, `lib/admin-session.ts`, `lib/admin-guard.ts`, `lib/admin-log.ts`, `lib/maintenance.ts`, `lib/staging.ts`, and `lib/ai/provider.ts` are marked `import "server-only"`. Importing any of these from a Client Component will cause a build-time error. `lib/admin-crypto.ts` uses `node:crypto` which achieves the same boundary implicitly.

## Further reading

- `docs/ARCHITECTURE.md` — deep dives: standalone system, service worker lifecycle, component hierarchy, page transitions
- `docs/API.md` — all 8 public endpoints with request/response examples
- `docs/ADMIN.md` — admin panel: auth flows, CRUD hierarchy, key rotation, first deploy walkthrough
- `docs/SCRAPING.md` — scraping pipeline: scrapers → staging → review
- `docs/SECURITY.md` — CSP rationale, SQL parameterization, secrets handling
- `tests/README.md` — test coverage map and isolation methodology
- `TODO.md` — placeholder pages and pending operational tasks (Sentry/Plausible activation, press/about content)
