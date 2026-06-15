# OptiWallet — Code Audit Report

> ⚠️ **Histórico (2026-06-10).** Superado por [`audit-2026-06-15.md`](audit-2026-06-15.md).
> La mayoría de estos hallazgos ya están corregidos y este reporte es **anterior
> al panel de administración**. Consérvalo solo como referencia de trazabilidad.

**Date:** 2026-06-10  
**Scope:** Full codebase (`app/`, `components/`, `lib/`, `public/sw.js`, `scripts/`, config files)  
**Mode:** Audit only — findings, no fixes

---

## Severity Legend

- 🔴 **Bug** — incorrect behavior, data loss risk, or crash potential
- 🟡 **Bad Practice** — works but fragile, unmaintainable, or against conventions
- 🔵 **Minor** — cosmetic or very low-impact issue

---

## 1. `lib/db.ts`

### 🔴 New Neon client created on every query call

```ts
export function sql(strings, ...values) {
  const query = neon(process.env.DATABASE_URL);  // recreated every call
  return query(strings, ...values);
}
```

`neon()` is called on every invocation of `sql`. In a serverless context this means a new connection pool object is instantiated per query, per request. The lazy-init goal (deferred past `next build`) is sound, but the implementation should cache the client after first init — not recreate it every time.

---

## 2. `app/api/banks/route.ts`

### 🟡 `SELECT *` instead of explicit column list

```sql
SELECT * FROM banks ORDER BY available DESC, name ASC
```

If the `banks` table ever gains columns (e.g., internal flags, credentials), they'll be silently exposed through the API response. Explicit column selection is safer.

---

## 3. `app/api/promotions/[merchantId]/route.ts`

### 🟡 `p.*` wildcard exposes all promotion columns

```sql
SELECT p.*, b.name AS bank_name FROM promotions p ...
```

Same issue as above. Columns like `created_at`, `updated_at`, and any future internal fields are sent to the client. Should select only the fields `ApiPromotion` actually describes.

---

## 4. `app/api/recommendations/route.ts`

### 🟡 No per-item validation on `cardIds` values

```ts
const cardIds = req.nextUrl.searchParams.getAll("cardIds");
if (cardIds.length > 100) { ... }
```

The count is capped at 100, but individual values are never validated for length or format. A request with 100 items each being a 10 KB string is technically accepted and forwarded to the database.

### 🟡 Date pattern accepts logically invalid dates

```ts
if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) { return 400; }
```

`9999-99-99` passes the regex but will produce a PostgreSQL error, surfacing as a 500 instead of a 400. Adding a `new Date(dateStr)` validity check would make the error cleaner.

---

## 5. `app/api/stats/route.ts`

### 🟡 `count(*)` not cast to integer

```sql
(SELECT count(*) FROM promotions WHERE active = true) AS promotions
```

`count(*)` returns PostgreSQL `bigint`. The `@neondatabase/serverless` driver serializes bigints as strings to preserve precision. Every other count in the codebase (`/api/categories`) uses `::int`. The inconsistency means `stats.promotions` arrives as `"42"` (a string) while `merchant_count` arrives as `42` (a number). The landing page type annotation reinforces this as `{ promotions: string }`, but the implicit difference is undocumented.

### 🔵 `rows[0]` accessed without length check

```ts
return NextResponse.json(rows[0], ...);
```

The query always returns one row (all scalar subqueries), so this is safe in practice, but it's undefended.

---

## 6. `lib/db.ts` — `apply-schema.ts`

### 🔴 Non-null assertion on `DATABASE_URL` in `scripts/apply-schema.ts`

```ts
const sql = neon(process.env.DATABASE_URL!);
```

The `!` suppresses the TypeScript error. If the variable isn't set at runtime, neon throws an opaque error instead of a clear "DATABASE_URL not set" message. The runtime script at `lib/db.ts` does this correctly (explicit check + clear error); the migration script should match.

### 🔴 SQL split by semicolon is naive

```ts
const statements = schema.split(";").map(s => s.trim()).filter(s => s.length > 0);
```

This breaks on semicolons inside string literals, procedure bodies, or comments. The current schema happens to be safe, but adding any PL/pgSQL function or a string constant containing `;` would silently corrupt the statement list.

### 🔴 Schema migration runs outside a transaction

Statements are applied one-by-one with no `BEGIN`/`COMMIT`. A failure mid-run leaves the schema in a partially applied state with no automatic rollback.

### 🟡 Raw `.query()` used instead of tagged template

```ts
await sql.query(stmt);
```

The rest of the codebase uses `sql\`...\`` (tagged template, parameterized). The migration script uses `.query(raw_string)`, bypassing parameterization. While no user input is involved here, it's inconsistent and would be dangerous if the script were ever extended to accept runtime arguments.

---

## 7. `lib/use-wallet.ts`

### 🔴 Stale closure in `addCard`, `removeCard`, `toggleCard`

```ts
const addCard = useCallback(
  (cardId: string) => {
    if (state.cardIds.includes(cardId)) return;
    persist([...state.cardIds, cardId]);  // state.cardIds captured at closure time
  },
  [state.cardIds, persist],
);
```

`state.cardIds` is read at the time the callback was created, not at the time it is called. If two calls happen before a re-render (e.g., during initialization or concurrent events), the second update is computed against stale state and one change is silently dropped. The `persist` function itself does update via `setState((prev) => ...)` but the `next` array passed to it is already computed from the stale snapshot.

### 🟡 Silent catch on localStorage write

```ts
try {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
} catch {}
```

Errors (quota exceeded, private-mode restrictions in certain browsers) are swallowed with no logging. The user's wallet state updates in memory but doesn't persist, with no visible indication.

---

## 8. `lib/hooks/use-api.ts`

### 🟡 `fetcherRef` update effect has no dependency array

```ts
useEffect(() => {
  fetcherRef.current = fetcher;
}); // no deps — runs after every render
```

This is the "latest ref" pattern and intentional, but it runs on every render of every component using any hook from this file. The intention should be documented more prominently (there is a comment above the hook but not on the effect itself).

---

## 9. `lib/api-client.ts`

### 🔴 `window.location.origin` used in `buildUrl` — crashes in SSR

```ts
function buildUrl(path: string, params): string {
  const url = new URL(path, window.location.origin);
```

`window` is not available in Node.js. If `buildUrl` — or any function that calls it — is ever executed server-side, it throws `ReferenceError: window is not defined`. All callers are currently in `"use client"` hooks, but it's an unguarded assumption. The Next.js convention is to use `typeof window !== "undefined"` guards or use a relative URL approach.

### 🟡 Non-JSON error responses cause opaque parse errors

```ts
const res = await fetch(url);
if (!res.ok) throw new Error(`API error ${res.status}`);
return res.json();
```

If the server returns a non-JSON error body (e.g., a Vercel 503 HTML page during a cold start), `res.json()` throws a `SyntaxError`, masking the original HTTP error. The pattern should check `res.ok` first, then attempt `res.json()` on the error body, or at minimum catch the parse error.

---

## 10. `lib/hooks/use-service-worker.ts`

### 🟡 Service Worker registered in development

```ts
// Only checks window + serviceWorker, NOT NODE_ENV
if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
```

The comment says "Solo en producción" but there is no `process.env.NODE_ENV !== "production"` check. The SW is registered during local development, which causes caching issues and makes it significantly harder to debug network requests and hot reload behavior.

### 🟡 `console.info` / `console.error` left in production

```ts
console.info("[OptiWallet SW] Registrado:", registration.scope);
console.info("[OptiWallet SW] Nueva versión disponible.");
console.error("[OptiWallet SW] Error al registrar:", error);
```

These log statements have no dev-only guard and will appear in every end-user's console.

---

## 11. `public/sw.js`

### 🔴 Cache mismatch — precached HTML pages are never served offline

During install, `/` and `/app` are stored in `STATIC_CACHE_NAME` (`"optiwallet-static-v1"`):

```js
const PRECACHE_URLS = ["/", "/app", ...];
// stored in STATIC_CACHE_NAME during install
```

But the fetch handler for HTML pages uses `CACHE_NAME` (`"optiwallet-v1"`):

```js
} else {
  event.respondWith(networkFirstStrategy(request, CACHE_NAME)); // "optiwallet-v1"
}
```

The offline HTML fallback also searches `CACHE_NAME`:

```js
return (await cache.match("/")) || new Response("Sin conexión", { status: 503 });
```

`/` was cached in `STATIC_CACHE_NAME`, not `CACHE_NAME`. The offline fallback will always miss and return a 503, defeating the purpose of precaching the root page.

### 🟡 `skipWaiting` + `clients.claim` combination is risky

`skipWaiting()` in install causes the new SW to activate immediately, evicting the old one. `clients.claim()` then takes over all open tabs instantly. If the new SW has a different cache version name, active tabs may suddenly have their in-flight requests handled by a SW that doesn't have their assets cached yet, causing broken page loads.

### 🟡 Redundant `pathname.startsWith("/api/")` check

```js
function isAPIRoute(pathname) {
  return (
    pathname.startsWith("/api/") &&               // redundant
    API_ROUTES.some((route) => pathname.startsWith(route))
  );
}
```

All entries in `API_ROUTES` already start with `/api/`, so the first check is always implied by the second.

### 🟡 Service worker is plain JavaScript — inconsistent with TypeScript codebase

No type checking, no JSDoc types. Given the SW handles cache logic that directly affects offline behavior and has several correctness bugs, this is a meaningful gap.

---

## 12. `app/app/page.tsx`

### 🟡 Imperative `document.getElementById` instead of `useRef`

```ts
onSearchClick={() => {
  document.getElementById('search-section')?.scrollIntoView({ behavior: 'smooth' });
}}
```

Direct DOM querying by ID is an anti-pattern in React — it bypasses React's virtual DOM and creates an invisible coupling between the `Header` and a hardcoded DOM ID in the page below it. A `ref` should be passed down.

---

## 13. `app/page.tsx` (Landing Page)

### 🟡 `faqs` array defined inside component — recreated on every render

```ts
export default function LandingPage() {
  const faqs = [ ... ]; // static content recreated every render
```

The array is entirely static and should be a module-level constant.

### 🟡 `toggleFaq` uses stale state value

```ts
const toggleFaq = (index: number) => {
  setOpenFaq(openFaq === index ? -1 : index); // openFaq may be stale
};
```

Should use the functional updater form: `setOpenFaq(prev => prev === index ? -1 : index)`.

### 🟡 Stats fetch silently swallows errors

```ts
fetch("/api/stats").then(r => r.json()).then(setStats).catch(() => {});
```

Errors produce no log output whatsoever.

### 🟡 Array index used as key in marquee

```ts
["Banco de Chile", ..., "Banco de Chile", ...].map((bank, i) => (
  <div key={i} className="bank-chip">{bank}</div>
))
```

Index keys are problematic if the list order ever changes. Since this list is intentionally duplicated for the marquee loop, using a content-based key (e.g., `${bank}-${i}`) would be more explicit about the intent.

---

## 14. `components/PageTransition.tsx`

### 🔴 Inline `onComplete` in `usePageTransition` causes the effect to re-run on every render

In `usePageTransition`:

```ts
const overlay = target ? (
  <PageTransition
    href={target}
    mode="navigate"
    onComplete={() => setTarget(null)}  // new function reference every render
  />
) : null;
```

`PageTransition`'s `useEffect` has `onComplete` in its dependency array:

```ts
}, [mode, href, router, onComplete]);
```

Every time the parent re-renders, a new `() => setTarget(null)` function is created. This triggers the effect again, resetting all three timers. If the landing page re-renders during the transition (e.g., `stats` arriving), the entire animation restarts.

### 🟡 Animation phase timings are magic numbers

`300`, `900`, `1250` are related values (`300 + 600 = 900`, `900 + 350 = 1250`) with no named constants explaining the relationships.

---

## 15. `components/MerchantDetail.tsx`

### 🟡 `buildBankNameMap` called on every render

```ts
const bankNameMap = buildBankNameMap(allPromos); // no useMemo
const getBankName = (bankId: string) => bankNameMap.get(bankId) ?? bankId;
```

Every state change (e.g., typing in the amount input) rebuilds the map. Should be wrapped in `useMemo`.

### 🟡 Bank name fallback is the bank ID string

`bankNameMap.get(bankId) ?? bankId` falls back to displaying the raw ID (e.g., `"bci"`) if a recommendation's bank is absent from the promotions list. This can happen if the DB has a data inconsistency.

### 🟡 Dual state for a single conceptual value (`amount` + `amountInput`)

Two state variables that must be kept in sync manually:

```ts
const [amount, setAmount] = useState<number | undefined>(undefined);
const [amountInput, setAmountInput] = useState("");
```

These are set together in the `onChange` handler. If either is set independently they will diverge.

### 🟡 `formatIsoDate` defined locally instead of in `lib/format.ts`

This function belongs with the other date formatters. Defining it at the bottom of a component file makes it invisible to other components that may need it.

### 🟡 Year omitted in date range display

```ts
function formatIsoDate(iso: string): string {
  const [, m, d] = dateStr.split("-"); // year discarded
  return `${parseInt(d, 10)}/${parseInt(m, 10)}`;
}
```

For a promotion valid `2025-12-01` to `2026-03-31`, this displays `1/12 — 31/3` with no year context. Promotions spanning year boundaries are unreadable.

### 🟡 Promotions with only `start_date` or only `end_date` are not displayed

```tsx
{promo.start_date && promo.end_date && (
  <div>Vigente {formatIsoDate(promo.start_date)} — {formatIsoDate(promo.end_date)}</div>
)}
```

If a promotion has `end_date` but no `start_date` (or vice versa), the date information is silently hidden.

---

## 16. `components/WalletSetup.tsx`

### 🔴 Initially expanded bank hardcoded as `"bci"`

```ts
const [expandedBank, setExpandedBank] = useState<string | null>("bci");
```

If BCI's database ID ever changes, or if BCI is unavailable/removed, this initial state silently does nothing (no bank expanded) or opens the wrong bank. The default should be `null` or the first available bank resolved after data loads.

### 🟡 `getCardsByBank` performs a full linear scan per bank on every render

```ts
const getCardsByBank = (bankId: string): ApiCard[] =>
  allCards.filter((c) => c.bank_id === bankId);
```

Called inside `banks.map(...)`, this is O(banks × cards) on every render. The full card list should be grouped into a `Map<bankId, ApiCard[]>` once via `useMemo`.

### 🟡 `selectedCardIds.includes(card.id)` is O(n) per card

Inside `BankRow`, the selected card count is computed by calling `.filter` twice on the `cards` array:

```ts
cards.filter((c) => selectedCardIds.includes(c.id)).length
// ... called again for the pluralization check
cards.filter((c) => selectedCardIds.includes(c.id)).length > 1 ? "s" : ""
```

The filter result should be stored in a variable. Additionally, `selectedCardIds.includes()` is O(n) — with many selected cards and many cards to check, this becomes O(cards × selectedCards). A `Set` should be used for O(1) lookup.

---

## 17. `components/TodaysFeed.tsx`

### 🟡 Merchant-level deduplication done client-side

The server returns all promotion+card combinations ordered by discount. The client then deduplicates by merchant, keeping the best per merchant. This could be handled in SQL (with `DISTINCT ON (m.id)` or a window function), reducing the payload size.

---

## 18. `components/RecommendationCard.tsx`

### 🟡 JSX stored in a variable instead of a component

```ts
const Inner = (<>...</>);
// Used twice: inside <button> and <div>
```

`Inner` is a JSX value, not a React component. It cannot be memoized and React cannot optimize its reconciliation. It should be extracted as a proper component (even an unexported local one).

### 🟡 `w-full text-left` classes only applied to button variant

```ts
<button className={`${className} w-full text-left`}>   // button variant
<div className={className}>                             // div variant — missing classes
```

The `div` variant silently lacks `w-full` and `text-left`, producing a different layout.

---

## 19. `components/DayPicker.tsx`

### 🔵 Single-letter display is ambiguous

```ts
{formatDayShort(day).charAt(0)}
```

`formatDayShort("Martes")` → `"Mar"` → `"M"` and `formatDayShort("Miércoles")` → `"Mié"` → `"M"`. Both Tuesday and Wednesday display `"M"` in the large font. The full three-letter abbreviation shown in monospace above mitigates the ambiguity, but the large letter is misleading.

---

## 20. `components/MerchantSearch.tsx`

### 🟡 "No encontramos" message shown with empty query

```tsx
<div className="mt-2 text-sm text-ink">
  {`No encontramos "${query}".`}
</div>
```

If the user has no query typed but has selected a category that contains no merchants, this renders `No encontramos "".` — a grammatically and semantically broken message.

---

## 21. `lib/types.ts`

### 🟡 Entire file is dead code

The domain types `Bank`, `Card`, `MerchantCategory`, `Merchant`, `Promotion`, `Recommendation` are not imported anywhere in the codebase. All components use the `Api*` types from `lib/api-client.ts` instead. This file appears to be a legacy design artifact.

---

## 22. API Type System

### 🟡 `modality` and `card_type` typed as plain `string` — require unsafe casts everywhere

In `ApiRecommendation`, `ApiPromotion`, and `ApiCard`:

```ts
modality:  string;  // actual values: "presencial" | "online" | "both"
card_type: string;  // actual values: "credit" | "debit"
```

Every call to `modalityLabel()` or any comparison requires an explicit cast:

```ts
modalityLabel(rec.modality as "presencial" | "online" | "both")
```

This appears six times across the codebase. The types should be narrowed to match the database `CHECK` constraints.

---

## 23. `public/manifest.json`

### 🟡 `start_url` points to landing page, not the app

```json
"start_url": "/"
```

When a user installs OptiWallet as a PWA and launches it from the home screen, they land on the marketing/landing page instead of the actual application at `/app`. `start_url` should be `"/app"`.

---

## 24. Cross-Cutting Concerns

### 🔴 No React Error Boundaries anywhere

If any component throws during render (e.g., due to an unexpected API response shape), React unmounts the entire tree and shows a blank page. No graceful error state is possible without Error Boundaries.

### 🟡 No rate limiting on any API route

`/api/recommendations` accepts up to 100 card IDs and runs a 4-table JOIN on every call. With no rate limiting, authentication, or IP-level throttling, this endpoint is a meaningful DoS vector. Vercel's edge functions offer some baseline protection, but there's no application-level guard.

### 🟡 No input length/format validation on `bankId`, `category`, `merchantId` parameters

`/api/cards`, `/api/merchants`, `/api/recommendations`, and `/api/promotions/[merchantId]` pass these parameters directly into parameterized SQL. SQL injection is prevented by parameterization, but there is no application-level rejection of unusually long strings or unexpected formats. A request with a 1 MB `merchantId` is accepted and forwarded to Neon.

### 🟡 `InnerPageLayout` duplicates nav and footer from landing page

`components/InnerPageLayout.tsx` renders an identical nav and footer to `app/page.tsx`. Any change to one requires a manual change to the other.

---

## Summary Table

| # | File | Severity | Issue |
|---|------|----------|-------|
| 1 | `lib/db.ts` | 🔴 | New Neon client created on every query |
| 2 | `scripts/apply-schema.ts` | 🔴 | Non-null assertion on DATABASE_URL |
| 3 | `scripts/apply-schema.ts` | 🔴 | Naive semicolon SQL splitting |
| 4 | `scripts/apply-schema.ts` | 🔴 | No transaction wrapping |
| 5 | `public/sw.js` | 🔴 | Cache mismatch — HTML offline fallback broken |
| 6 | `lib/use-wallet.ts` | 🔴 | Stale closure in addCard/removeCard/toggleCard |
| 7 | `components/WalletSetup.tsx` | 🔴 | Hardcoded `"bci"` as initial expanded bank |
| 8 | `components/PageTransition.tsx` | 🔴 | Inline `onComplete` resets timers on every parent re-render |
| 9 | App-wide | 🔴 | No React Error Boundaries |
| 10 | `lib/api-client.ts` | 🔴 | `window.location.origin` — crashes in SSR context |
| 11 | `app/api/banks/route.ts` | 🟡 | `SELECT *` |
| 12 | `app/api/promotions/[merchantId]/route.ts` | 🟡 | `p.*` wildcard |
| 13 | `app/api/recommendations/route.ts` | 🟡 | No per-item validation on cardIds values |
| 14 | `app/api/recommendations/route.ts` | 🟡 | Date regex allows logically invalid dates |
| 15 | `app/api/stats/route.ts` | 🟡 | count(*) not cast to int — type inconsistency |
| 16 | `scripts/apply-schema.ts` | 🟡 | Raw `.query()` instead of tagged template |
| 17 | `lib/use-wallet.ts` | 🟡 | Silent catch on localStorage write |
| 18 | `lib/api-client.ts` | 🟡 | Non-JSON error responses cause opaque parse failures |
| 19 | `lib/hooks/use-service-worker.ts` | 🟡 | SW registered in development (no env check) |
| 20 | `lib/hooks/use-service-worker.ts` | 🟡 | console.info/error in production |
| 21 | `public/sw.js` | 🟡 | skipWaiting + clients.claim without cache version coordination |
| 22 | `public/sw.js` | 🟡 | Redundant `pathname.startsWith("/api/")` check |
| 23 | `public/sw.js` | 🟡 | Plain JavaScript in a TypeScript codebase |
| 24 | `app/app/page.tsx` | 🟡 | `document.getElementById` instead of useRef |
| 25 | `app/page.tsx` | 🟡 | `faqs` array defined inside component |
| 26 | `app/page.tsx` | 🟡 | `toggleFaq` uses stale state |
| 27 | `app/page.tsx` | 🟡 | Stats fetch error silently swallowed |
| 28 | `app/page.tsx` | 🟡 | Array index key in marquee |
| 29 | `components/MerchantDetail.tsx` | 🟡 | `buildBankNameMap` called every render — should be useMemo |
| 30 | `components/MerchantDetail.tsx` | 🟡 | Bank name falls back to raw ID string |
| 31 | `components/MerchantDetail.tsx` | 🟡 | Dual state for amount/amountInput |
| 32 | `components/MerchantDetail.tsx` | 🟡 | `formatIsoDate` defined locally, not in lib/format.ts |
| 33 | `components/MerchantDetail.tsx` | 🟡 | Year omitted in promotion date range display |
| 34 | `components/MerchantDetail.tsx` | 🟡 | Single start_date or end_date silently not shown |
| 35 | `components/WalletSetup.tsx` | 🟡 | O(banks × cards) scan per render in getCardsByBank |
| 36 | `components/WalletSetup.tsx` | 🟡 | O(n) includes() per card + duplicate filter computation |
| 37 | `components/TodaysFeed.tsx` | 🟡 | Merchant deduplication done client-side instead of SQL |
| 38 | `components/RecommendationCard.tsx` | 🟡 | JSX stored in variable instead of component |
| 39 | `components/RecommendationCard.tsx` | 🟡 | w-full/text-left missing from div variant |
| 40 | `components/MerchantSearch.tsx` | 🟡 | Empty-query "no results" message is grammatically broken |
| 41 | `components/InnerPageLayout.tsx` | 🟡 | Duplicates nav and footer from landing page |
| 42 | `lib/types.ts` | 🟡 | Entire file is unused dead code |
| 43 | `lib/api-client.ts` + components | 🟡 | modality and card_type typed as string — unsafe casts everywhere |
| 44 | `public/manifest.json` | 🟡 | start_url is "/" instead of "/app" |
| 45 | App-wide | 🟡 | No rate limiting on API routes |
| 46 | App-wide | 🟡 | No input length/format validation on URL params |
| 47 | `components/DayPicker.tsx` | 🔵 | Single-letter display is ambiguous (Mar/Mié both show "M") |
| 48 | `app/api/stats/route.ts` | 🔵 | rows[0] accessed without length check |
