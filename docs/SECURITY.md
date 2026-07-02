# Seguridad — OptiWallet

> Última actualización: 2026-07-01 · v1.0.0-beta.2

Este documento describe la postura de seguridad de la **PWA pública** de OptiWallet (marketing + APIs de lectura), las defensas implementadas, y las recomendaciones operativas pendientes.

> **Nota:** el panel de administración vive en un repo separado (`Optiwallet-admin`), con su propia superficie de ataque, autenticación (bcrypt + TOTP) y documentación de seguridad. Ambos repos comparten el mismo Neon — ver `ARCHITECTURE_DECISION.md` para el racional del split.

---

## Índice

- [Superficie de ataque](#superficie-de-ataque)
- [Security headers](#security-headers)
- [SQL y base de datos](#sql-y-base-de-datos)
- [Validación de input](#validación-de-input)
- [Manejo de errores](#manejo-de-errores)
- [Secretos y variables de entorno](#secretos-y-variables-de-entorno)
- [Cookies](#cookies)
- [Service Worker](#service-worker)
- [Content Security Policy (detalle)](#content-security-policy-detalle)
- [Recomendaciones operativas](#recomendaciones-operativas)

---

## Superficie de ataque

OptiWallet tiene una superficie de ataque **intencionalmente reducida**:

| Aspecto | Postura |
|---|---|
| Autenticación de usuario final | No hay cuentas de usuario. Sin login, sin sesiones, sin tokens. |
| Datos sensibles | No se almacenan datos personales del usuario. La wallet es `localStorage` local. |
| API pública | Solo `GET`. Las únicas excepciones que escriben señales de usuario (sin mutar el catálogo) son `POST /api/promo-events` (analytics) y `POST`/`PATCH /api/promo-reports` (reportes). Ambas comparten el mismo rate limiter en memoria (`lib/rate-limit.ts`) — ver *Recomendaciones operativas*. |
| Escritura de catálogo | Este repo no expone ningún endpoint de escritura sobre `banks`/`cards`/`merchants`/`promotions` — esas mutaciones viven en el repo admin, autenticado por separado (sesión HMAC-SHA256 + TOTP), sobre el mismo Neon compartido. |
| Base de datos | Neon PostgreSQL serverless. El connection string solo vive en el servidor y en Vercel secrets. |
| Uploads | No hay uploads de archivos. |
| Pagos | No hay integración de pagos. |
| OAuth / terceros | La app desplegada no llama a servicios externos. La única salida a terceros es Google Places, y ocurre **solo** desde el script de tooling local `compute-merchant-popularity.ts` (no en runtime). |

---

## Security headers

Configurados en `next.config.mjs` y aplicados a **todas las rutas** (`/(.*)`):

### Content-Security-Policy

```
default-src 'self';
script-src 'self' 'unsafe-inline' https://plausible.io;
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:;
font-src 'self';
connect-src 'self' https://plausible.io https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://*.ingest.de.sentry.io;
manifest-src 'self';
worker-src 'self';
object-src 'none';
base-uri 'self';
form-action 'self';
frame-ancestors 'none';
upgrade-insecure-requests
```

> **Nota sobre `unsafe-inline`:** Next.js App Router hidrata con `<script>` inline. Usar nonces requeriría render dinámico en todas las páginas (vía `proxy.ts`), perdiendo el static optimization de la landing. Es un trade-off aceptable para la beta; a futuro se planea migrar a nonces.

> **Orígenes externos (Sprint 2):** `https://plausible.io` (script de analytics + endpoint de eventos, US-ANA) y los dominios de ingest de Sentry en `connect-src` (reportes de error, US-ERR). Son los **únicos** orígenes externos de toda la app; Swagger UI (`/api-docs`) se sirve self-hosted desde `public/swagger/` justamente para no agregar CDNs a la CSP.

### Otros headers

| Header | Valor | Propósito |
|---|---|---|
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains` | HSTS 2 años + subdominios. Vercel ya lo incluye en `*.vercel.app`, pero declararlo cubre dominios custom futuros. |
| `X-Content-Type-Options` | `nosniff` | Previene MIME sniffing |
| `X-Frame-Options` | `DENY` | Previene clickjacking (redundante con `frame-ancestors 'none'`, pero cubre browsers legacy) |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Solo envía origen en requests cross-origin |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=(), usb=()` | Deniega APIs que no usamos |

### `X-Powered-By`

Deshabilitado (`poweredByHeader: false` en `next.config.mjs`). No se expone que es Next.js.

---

## SQL y base de datos

### Queries parametrizadas

**Todos** los Route Handlers usan tagged template literals de Neon:

```typescript
// Correcto — parametrizado automáticamente:
const rows = await sql`
  SELECT * FROM merchants WHERE id = ${merchantId}
`;

// NUNCA se hace esto:
const rows = await sql.query(`SELECT * FROM merchants WHERE id = '${merchantId}'`);
```

El driver de Neon convierte las interpolaciones en **parámetros bind** (`$1`, `$2`, ...) a nivel de protocolo PostgreSQL — no hay concatenación de strings SQL.

### Escape de comodines LIKE

En `/api/merchants`, el texto de búsqueda se escapa antes de usarse en `LIKE`:

```typescript
const q = qRaw.replace(/[\\%_]/g, "\\$&");
// Buscar "100%" no actúa como patrón LIKE
```

### Columnas explícitas

Todos los `SELECT` usan columnas explícitas (nunca `SELECT *`). Si la tabla gana campos internos a futuro (ej: `created_at`, `internal_notes`), no se filtran solos por la API.

### Índices

```sql
CREATE INDEX idx_promotions_merchant ON promotions(merchant_id);
CREATE INDEX idx_promotions_bank     ON promotions(bank_id);
CREATE INDEX idx_promotions_active   ON promotions(active);
CREATE INDEX idx_promotions_days     ON promotions USING GIN(days_of_week);
```

---

## Validación de input

### IDs (`lib/validate.ts`)

```typescript
const ID_RE = /^[A-Za-z0-9_.-]{1,64}$/;

export function isValidId(value: string): boolean {
  return ID_RE.test(value);
}

export function areValidIds(values: string[]): boolean {
  return values.every(isValidId);
}
```

**Scope:** letras, dígitos, guión, guión bajo y punto. Máximo 64 caracteres. Cualquier otra cosa retorna `400` inmediatamente.

**Defensa en profundidad:** esto NO es la defensa contra SQL injection (eso lo hacen las queries parametrizadas). Es un filtro temprano que:
- Corta payloads basura/probes antes de que toquen la base
- Mantiene los logs de Vercel y la cache del CDN limpios

### Validación por endpoint

| Endpoint | Parámetro | Validación |
|---|---|---|
| `/api/cards` | `bankId` | `isValidId` (si presente) |
| `/api/merchants` | `q` | Truncado a 80 chars + escape LIKE |
| `/api/merchants` | `category` | `isValidId` (si presente) |
| `/api/merchants/[id]` | `merchantId` | `isValidId` |
| `/api/promotions/[id]` | `merchantId` | `isValidId` |
| `/api/recommendations` | `cardIds` | `areValidIds` + max 100 |
| `/api/recommendations` | `date` | Regex `YYYY-MM-DD` + `Date` parsing |
| `/api/recommendations` | `merchantId` | `isValidId` (si presente) |

### Fechas

El endpoint `/api/recommendations` valida la fecha en dos pasos:
1. **Regex:** `^\d{4}-\d{2}-\d{2}$` — formato correcto
2. **Parsing:** `new Date(dateStr + "T00:00:00Z")` — fecha lógicamente válida (rechaza `"9999-99-99"`)

---

## Manejo de errores

### Errores 500

Todos los Route Handlers usan `try/catch`:

```typescript
try {
  // ... query
} catch (err) {
  console.error("GET /api/... failed:", err);
  return NextResponse.json({ error: "Error interno" }, { status: 500 });
}
```

- El cliente recibe `{"error":"Error interno"}` genérico.
- El detalle (`err`) va a los logs de Vercel — **nunca al cliente**.
- No se exponen stack traces, nombres de tablas, queries SQL ni mensajes de PostgreSQL.

### Errores 400

Los errores de validación sí devuelven un mensaje descriptivo:
- `"bankId inválido"`, `"category inválida"`, `"cardIds inválidos"`, etc.
- Estos mensajes **no contienen input del usuario** — son strings fijos.

---

## Secretos y variables de entorno

### `DATABASE_URL`

- **En producción:** vive en los **secrets de Vercel** — nunca en el repositorio.
- **En desarrollo:** vive en `.env.local` (gitignored).
- **Template:** `.env.example` contiene un placeholder de ejemplo.
- **Historial git:** limpio — la URL nunca fue commiteada.

### Acceso en código

Estos archivos leen `DATABASE_URL`:
1. `lib/db.ts` — cliente SQL lazy (server-side, Route Handlers)
2. `scripts/apply-schema.ts` — tooling local de desarrollo
3. `scripts/seed.ts` — reset destructivo + datos mock (tooling local)
4. `scripts/gen-seed.ts` — regenera `scripts/seed.ts` desde la DB actual (tooling local)
5. `scripts/migrate-categories-to-tags.ts` — migración one-off, idempotente (tooling local)
6. `scripts/refresh-promos.ts` — job diario que rota `promotion_codes` (tooling local / cron)
7. `scripts/compute-merchant-popularity.ts` — escribe la popularidad de comercios (tooling local)

**Protección en build:** el cliente lazy no inicializa `neon()` si `DATABASE_URL` no está definida. Esto previene crashes durante `next build`, donde Vercel evalúa los route modules sin secrets disponibles.

### Claves de analytics y observabilidad

- **`NEXT_PUBLIC_SENTRY_DSN`** y **`NEXT_PUBLIC_PLAUSIBLE_SRC`** son públicas (viajan al browser por diseño): no son secretos, solo activan Sentry y el script v2 de Plausible.
- **`GOOGLE_PLACES_API_KEY`** es **solo de tooling local** (`scripts/compute-merchant-popularity.ts`): nunca se lee en runtime ni se hornea en build, así que no expande la superficie de la app desplegada. Restríngela a "Places API (New)" en GCP.
- Las claves del panel admin (`ADMIN_SESSION_SECRET`, `ADMIN_TOTP_ENC_KEY`) no existen en este repo — viven exclusivamente en `Optiwallet-admin`.

---

## Cookies

### `ow_standalone` (app pública)

| Atributo | Valor |
|---|---|
| Nombre | `ow_standalone` |
| Valor | `1` |
| Path | `/` |
| Max-Age | 31536000 (1 año) |
| SameSite | `Lax` |
| Secure | Solo en HTTPS |
| HttpOnly | No (necesita ser leída por JS) |
| Contenido sensible | No — solo indica si la app se ejecuta en modo standalone |

> Esta app no usa cookies de sesión, autenticación ni tracking. `ow_standalone`
> es la única cookie que escribe, y no es sensible. La cookie de sesión del
> panel admin (`ow_admin_session`) vive en un dominio separado
> (`admin.optiwallet.cl`), fuera del alcance de este repo.

---

## Service Worker

### Seguridad del SW

- Se registra solo en **producción** (`NODE_ENV === "production"`).
- Solo intercepta requests **GET** del **mismo origen**.
- No cachea responses con error (solo `response.ok`).
- El cache se limpia en cada activación (versionado por nombre de cache, derivado del `SW_VERSION` = commit SHA del deploy).

### Offline responses

- **JSON offline:** `{"error":"Sin conexión","offline":true}` con `503` — el cliente puede detectar `.offline === true`.
- **HTML offline:** fallback a `/` (landing cacheada) — no a una página de error genérica.

---

## Content Security Policy (detalle)

| Directiva | Valor | Razón |
|---|---|---|
| `default-src` | `'self'` | Solo recursos propios |
| `script-src` | `'self' 'unsafe-inline' https://plausible.io` | Next.js hydration (ver nota) + script de Plausible (US-ANA) |
| `style-src` | `'self' 'unsafe-inline'` | Tailwind + inline styles |
| `img-src` | `'self' data: blob:` | Imágenes locales + SVG inline (data:) |
| `font-src` | `'self'` | Fuentes self-hosted (next/font) |
| `connect-src` | `'self' https://plausible.io https://*.ingest.*.sentry.io` | API propia + eventos Plausible + reportes Sentry (US-ERR) |
| `manifest-src` | `'self'` | PWA manifest local |
| `worker-src` | `'self'` | Service worker local |
| `object-src` | `'none'` | Sin Flash ni plugins |
| `base-uri` | `'self'` | Previene ataques de base tag injection |
| `form-action` | `'self'` | No hay forms que envíen a terceros |
| `frame-ancestors` | `'none'` | No permite ser embebido en iframes |
| `upgrade-insecure-requests` | — | Fuerza HTTPS en requests mixtos |

**Ausencias notables:**
- No hay `script-src 'nonce-...'` (requeriría render dinámico — planificado)
- No hay `report-uri` ni `report-to` (sin reporting de violaciones CSP — recomendado)

---

## Recomendaciones operativas

Mejoras de seguridad recomendadas para post-beta:

### Prioridad alta

| Mejora | Estado | Detalle |
|---|---|---|
| **Rate limiting (API pública)** | ⚠️ Parcial | Los dos endpoints públicos de escritura implementan rate limiting en memoria vía el módulo compartido `lib/rate-limit.ts` (`fixedWindowRateLimit`, ventana fija por sesión con fallback a IP): `POST /api/promo-events` a 120/min, `POST /api/promo-reports` a 20/min. Es un dampener por instancia de Vercel (no un límite estricto global — ver el comentario en el módulo), suficiente para floods casuales/accidentales. Los endpoints públicos de lectura (`GET`) no tienen rate limit en la app (mitigados por caché de edge en Vercel); se recomienda activar Vercel WAF para mitigación global. |
| **CSP con nonces** | ❌ Pendiente | Reemplazar `'unsafe-inline'` por nonces dinámicos en `script-src`. Requiere evaluar el impacto en static optimization. |
| **Error boundaries** | ✅ Implementado | `app/error.tsx` (boundary global, reporta a Sentry) y `app/global-error.tsx` (boundary de último recurso con estilos inline). Ver [`ARCHITECTURE.md`](ARCHITECTURE.md). |

### Prioridad media

| Mejora | Estado | Detalle |
|---|---|---|
| **CSP reporting** | ❌ Pendiente | Agregar `report-uri` o `report-to` para monitorear violaciones de CSP en producción. |
| **Subresource Integrity** | ❌ Pendiente | SRI para assets estáticos (next/font ya los self-hostea, pero bundles de third-party futuros deberían tener SRI). |
| **DB user de solo lectura** | ❌ Pendiente | El connection string actual tiene permisos de escritura (necesarios para `apply-schema.ts`). En producción, se podría usar un usuario con `SELECT` only. |
| **Banner de actualización SW** | ✅ Implementado | Cuando el SW detecta una nueva versión, se muestra un banner pill flotante glassmorphism para actualizar e instalar la nueva versión de inmediato. |
| **UI offline** | ✅ Implementado | `OfflineBanner` (banner fijo superior, `lib/hooks/use-online-status.ts`) avisa apenas `navigator.onLine` pasa a `false` — antes el SW servía la cache sin ningún indicador visual. |

### Prioridad baja

| Mejora | Estado | Detalle |
|---|---|---|
| **Logging estructurado** | ✅ Parcial | **Sentry** está activo en producción (DSN configurado en Vercel, 2026-06-13). Los `console.error` de Route Handlers van a Vercel Logs, y los errores de render/request se reportan a Sentry automáticamente vía `captureException` / `captureRequestError`. |
| **CORS headers** | ✅ No necesario | La API es solo para consumo propio (`connect-src 'self'`). No se necesitan CORS headers. |
| **CSRF (API pública)** | ✅ No aplica | La API pública es solo `GET` sin cookies de sesión; las dos excepciones de escritura (`promo-events`, `promo-reports`) tampoco dependen de cookies. |
