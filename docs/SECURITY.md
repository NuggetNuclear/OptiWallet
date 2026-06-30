# Seguridad — OptiWallet

> Última actualización: 2026-06-30 · v1.0.0-beta.2

Este documento describe la postura de seguridad de OptiWallet, las defensas implementadas, y las recomendaciones operativas pendientes. Para la seguridad específica del panel de administración, ver [`docs/ADMIN.md`](ADMIN.md#seguridad-del-panel).

---

## Índice

- [Superficie de ataque](#superficie-de-ataque)
- [Panel de administración](#panel-de-administración)
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
| API pública | Solo `GET` / `SELECT`. No hay escritura, no hay mutaciones. |
| API admin (`/api/admin/*`) | Escritura completa, protegida por sesión HMAC-SHA256 + TOTP. Ver sección siguiente. |
| Base de datos | Neon PostgreSQL serverless. El connection string solo vive en el servidor y en Vercel secrets. |
| Uploads | No hay uploads de archivos. |
| Pagos | No hay integración de pagos. |
| OAuth / terceros | La app desplegada no llama a servicios externos. La única salida a terceros es Google Places, y ocurre **solo** desde el script de tooling local `compute-merchant-popularity.ts` (no en runtime). |

---

## Panel de administración

El panel admin en `/admin` agrega una **superficie de ataque adicional y controlada**. Está completamente separado de la app pública.

### Modelo de acceso

| Capa | Protección |
|---|---|
| Rutas `/admin/*` | `proxy.ts` (Edge Runtime) verifica la cookie HMAC antes de renderizar cualquier página |
| Endpoints `/api/admin/*` | `requireAdmin()` valida la cookie **y la re-verifica contra la DB** en cada Route Handler: un admin eliminado, con TOTP reseteado o deshabilitado pierde acceso de inmediato |
| Rate limiting | 5 intentos fallidos/IP/15 min (tabla `admin_login_attempts`), compartido entre login, verify-totp y enrolamiento TOTP — sin superficies de fuerza bruta sin throttle |
| Paso 1 login | bcrypt costo 12 + anti-enumeración (mismo error para email desconocido y contraseña incorrecta) |
| Paso 2 login | TOTP obligatorio (Google Authenticator, ±1 ventana de 30s) |
| Secretos TOTP | Cifrados en reposo con AES-256-GCM (`lib/admin-crypto.ts`); nunca en texto plano en la DB |
| Creación de admins | Sin página web pública de setup: el primer admin se crea por CLI (`admin:create`), el resto desde el panel autenticado |
| Sesión | Cookie `HttpOnly; Secure; SameSite=Strict; Path=/`, firmada HMAC-SHA256, 8h de duración |

### Nuevas cookies

| Cookie | Uso | HttpOnly | SameSite | Path |
|---|---|---|---|---|
| `ow_admin_session` | Sesión de admin, firmada HMAC-SHA256 | ✓ | Strict | `/` (debe cubrir `/api/admin/*`) |

### Nuevas variables de entorno

| Variable | Descripción |
|---|---|
| `ADMIN_SESSION_SECRET` | Secreto para firmar sesiones HMAC-SHA256. Generar con `openssl rand -hex 32`. **Nunca debe aparecer en el repositorio.** |
| `ADMIN_TOTP_ENC_KEY` | Clave para cifrar secretos TOTP en reposo (AES-256-GCM). Generar con `openssl rand -hex 32`. Si se omite se deriva de `ADMIN_SESSION_SECRET`. **Nunca debe aparecer en el repositorio.** |

### Compartimentalización

Los módulos con lógica de autenticación están marcados con `import "server-only"`:
- `lib/admin-auth.ts` — bcryptjs + otpauth (no se pueden ejecutar en el browser)
- `lib/admin-session.ts` — cookies y tokens HMAC
- `lib/admin-guard.ts` — validación de sesión contra DB + rate limiting
- `lib/db.ts` — cliente de base de datos

`lib/admin-crypto.ts` se confina al servidor vía `node:crypto` (no bundleable para el browser), por lo que la clave y el cifrado nunca llegan al cliente.

Si un Client Component importa cualquiera de estos módulos, Next.js lanza un error en build time antes de que el código llegue a producción.

### Referencia completa

Ver [`docs/ADMIN.md`](ADMIN.md) para la arquitectura detallada, walkthrough de despliegue y referencia de API del panel.

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

Solo cuatro archivos leen `DATABASE_URL`:
1. `lib/db.ts` — cliente SQL lazy (server-side, Route Handlers)
2. `scripts/apply-schema.ts` — tooling local de desarrollo
3. `scripts/seed.ts` — reset destructivo + datos mock (tooling local)
4. `scripts/compute-merchant-popularity.ts` — escribe la popularidad de comercios (tooling local)

**Protección en build:** el cliente lazy no inicializa `neon()` si `DATABASE_URL` no está definida. Esto previene crashes durante `next build`, donde Vercel evalúa los route modules sin secrets disponibles.

### Claves del panel admin y analytics

- **`ADMIN_SESSION_SECRET`** (firma HMAC de sesiones) y **`ADMIN_TOTP_ENC_KEY`** (cifra los `totp_secret` en reposo) son **server-only**: nunca llevan prefijo `NEXT_PUBLIC_` y viven solo en `.env.local` y en los secrets de Vercel.
- **`NEXT_PUBLIC_SENTRY_DSN`** y **`NEXT_PUBLIC_PLAUSIBLE_SRC`** sí son públicas (viajan al browser por diseño): no son secretos, solo activan Sentry y el script v2 de Plausible.
- **`GOOGLE_PLACES_API_KEY`** es **solo de tooling local** (`scripts/compute-merchant-popularity.ts`): nunca se lee en runtime ni se hornea en build, así que no expande la superficie de la app desplegada. Restríngela a "Places API (New)" en GCP.
- **No existe** ningún "admin setup token" (la página web de setup fue eliminada) ni `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` (reemplazada por `NEXT_PUBLIC_PLAUSIBLE_SRC`).

Inventario completo, gotchas y procedimiento de rotación: [`docs/ADMIN.md` → Inventario y rotación de claves](ADMIN.md#inventario-y-rotación-de-claves).

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

### `ow_admin_session` (panel de administración)

| Atributo | Valor |
|---|---|
| Nombre | `ow_admin_session` |
| Valor | Token de sesión firmado HMAC-SHA256 (incluye `token_version` para revocación) |
| Path | `/` (debe cubrir `/admin` y `/api/admin`) |
| Max-Age | 28800 (8 horas) |
| SameSite | `Strict` (defensa CSRF para las mutaciones del panel) |
| Secure | ✓ en producción |
| HttpOnly | ✓ (no accesible desde JS) |

> La app **pública** no usa cookies de sesión, autenticación ni tracking. La
> única cookie con sesión es `ow_admin_session`, exclusiva del panel admin
> (`/admin`). Ver [`docs/ADMIN.md`](ADMIN.md).

---

## Service Worker

### Seguridad del SW

- Se registra solo en **producción** (`NODE_ENV === "production"`).
- Solo intercepta requests **GET** del **mismo origen**.
- **No intercepta `/admin` ni `/api/admin`**: las respuestas del panel (lista de
  admins, audit log) nunca entran a CacheStorage del browser, aunque viajan con
  `Cache-Control: no-store`.
- No cachea responses con error (solo `response.ok`).
- El cache se limpia en cada activación (versionado por nombre de cache, hoy `v3`).

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
| **Rate limiting (API pública)** | ❌ Pendiente | La API **pública** (solo lectura) no tiene rate limiting de app. Mitigado parcialmente por el cache de edge de Vercel. Recomendación: activar **Vercel WAF** o rate limiting por IP en el proxy. (El API **admin** sí tiene rate limiting por IP — ver `docs/ADMIN.md`.) |
| **CSP con nonces** | ❌ Pendiente | Reemplazar `'unsafe-inline'` por nonces dinámicos en `script-src`. Requiere evaluar el impacto en static optimization. |
| **Error boundaries** | ✅ Implementado | `app/error.tsx` (boundary global, reporta a Sentry) y `app/global-error.tsx` (boundary de último recurso con estilos inline). Ver [`ARCHITECTURE.md`](ARCHITECTURE.md). |

### Prioridad media

| Mejora | Estado | Detalle |
|---|---|---|
| **CSP reporting** | ❌ Pendiente | Agregar `report-uri` o `report-to` para monitorear violaciones de CSP en producción. |
| **Subresource Integrity** | ❌ Pendiente | SRI para assets estáticos (next/font ya los self-hostea, pero bundles de third-party futuros deberían tener SRI). |
| **DB user de solo lectura** | ❌ Pendiente | El connection string actual tiene permisos de escritura (necesarios para `apply-schema.ts`). En producción, se podría usar un usuario con `SELECT` only. |
| **Banner de actualización SW** | ❌ Pendiente | El SW detecta actualizaciones pero solo loguea. Agregar UI de "nueva versión disponible". |
| **UI offline** | ❌ Pendiente | Sin indicador visual cuando no hay conexión. El SW sirve cache silenciosamente. |

### Prioridad baja

| Mejora | Estado | Detalle |
|---|---|---|
| **Logging estructurado** | ✅ Parcial | **Sentry** está activo en producción (DSN configurado en Vercel, 2026-06-13). Los `console.error` de Route Handlers van a Vercel Logs, y los errores de render/request se reportan a Sentry automáticamente vía `captureException` / `captureRequestError`. |
| **CORS headers** | ✅ No necesario | La API es solo para consumo propio (`connect-src 'self'`). No se necesitan CORS headers. |
| **CSRF (API pública)** | ✅ No aplica | La API pública es solo `GET` sin cookies de sesión. |
| **CSRF (panel admin)** | ✅ Mitigado | El panel sí tiene mutaciones (`POST`/`PATCH`/`DELETE`) y cookie de sesión, pero la cookie es `SameSite=Strict`, así que un sitio de terceros no puede dispararlas. Además, las operaciones sensibles exigen re-auth con la contraseña actual. |
