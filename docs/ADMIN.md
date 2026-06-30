# Panel de Administración — OptiWallet

> Última actualización: 2026-06-30 · v1.0.0-beta.2

Este documento cubre todo lo necesario para operar, desplegar y extender el panel de administración de OptiWallet: arquitectura, seguridad, referencia de API, walkthrough de despliegue y guía de uso.

---

## Índice

- [Visión general](#visión-general)
- [Arquitectura](#arquitectura)
- [Autenticación](#autenticación)
- [Compartimentalización del código](#compartimentalización-del-código)
- [Walkthrough: primer despliegue](#walkthrough-primer-despliegue)
- [Walkthrough: uso diario](#walkthrough-uso-diario)
- [API Reference — Admin](#api-reference--admin)
- [CRUD por entidad](#crud-por-entidad)
- [Seguridad del panel](#seguridad-del-panel)
- [Referencia de variables de entorno](#referencia-de-variables-de-entorno)

---

## Visión general

El panel admin es un subsite protegido en `/admin` que permite a administradores autorizados:

- **CRUD completo** sobre las 5 tablas de la base de datos: `banks`, `cards`, `merchant_categories`, `merchants`, `promotions`. (Las columnas de popularidad de `merchants` —`popularity_prior`, `merchant_tier`, `places_*`— no se editan a mano: las puebla el script `npm run popularity:compute`.)
- **Resolución de dependencias** antes de operaciones destructivas (ver qué registros dependen de lo que vas a borrar).
- **Gestión de admins**: crear, listar, cambiar contraseña, resetear TOTP, eliminar. El primer admin (`is_root = true`) está protegido contra eliminación.
- **Autenticación robusta**: contraseña + TOTP (Google Authenticator), sesión HMAC-firmada, rate limiting por IP.
- **Central de operaciones**: scraping de promociones por banco → cola de revisión (`promo_staging`) → aprobación (individual o masiva, con consola de progreso en vivo) → `promotions`. Ver [`docs/SCRAPING.md`](./SCRAPING.md).
- **Modo mantenimiento**: toggle protegido por TOTP que redirige a todos los usuarios públicos a `/mantencion` (el panel admin sigue accesible).
- **Registro de actividad**: bitácora de auditoría de las últimas 500 acciones / 30 días, con filtros y auto-refresh.

---

## Arquitectura

```
app/admin/                    ← UI del panel (Next.js App Router, server + client components)
├── layout.tsx                ← Shell del admin (metadata noindex, import de admin.css)
├── admin.css                 ← Estilos scoped al panel
├── components/
│   ├── AdminNav.tsx          ← Sidebar de navegación (Operaciones / Base de datos / Sistema)
│   ├── AdminShell.tsx        ← Wrapper que verifica sesión (llama a /api/admin/auth/me)
│   ├── ConfirmModal.tsx      ← Modal de confirmación genérico (acciones sin dependencias)
│   ├── DeleteModal.tsx       ← Modal de confirmación con lista de dependencias
│   └── TerminalConsole.tsx   ← Consola estilo terminal: streaming SSE en vivo (aprobación masiva)
├── login/page.tsx            ← Formulario dos fases: contraseña → código TOTP
├── totp-setup/page.tsx       ← Enrolamiento TOTP (primer login)
├── page.tsx                  ← Dashboard: estadísticas + navegación
├── users/                    ← Gestión de admins
│   ├── page.tsx
│   ├── new/page.tsx
│   └── [id]/page.tsx
├── audit/page.tsx            ← Registro de actividad (lee /api/admin/audit, filtros + auto-refresh)
├── ops/                      ← Central de operaciones: scraping → staging → revisión
│   ├── page.tsx              ← Overview por banco + panel de modo mantenimiento + botón Fetch
│   ├── [bankId]/page.tsx     ← Cola de revisión de staging de un banco (aprobar/rechazar/autofill)
│   └── import/page.tsx       ← Importar JSON de scraper subido manualmente
└── data/                     ← CRUD de datos
    ├── banks/page.tsx
    ├── cards/page.tsx
    ├── categories/page.tsx
    ├── merchants/page.tsx
    └── promotions/page.tsx   ← incluye selección múltiple + borrado masivo (TOTP)

app/api/admin/                ← API Routes del panel (todas protegidas con sesión)
├── auth/
│   ├── login/route.ts        ← POST: autenticación en dos fases
│   ├── verify-totp/route.ts  ← POST: verificación de código TOTP
│   ├── logout/route.ts       ← POST: cierre de sesión
│   └── me/route.ts           ← GET: perfil de la sesión activa
├── users/
│   ├── route.ts              ← GET (lista, incluye is_root), POST (crear admin)
│   └── [id]/
│       ├── route.ts          ← GET, PATCH (contraseña/TOTP), DELETE (bloquea is_root)
│       └── totp-setup/route.ts ← GET (QR), POST (activar TOTP)
├── audit/route.ts            ← GET: últimas 500 entradas / 30 días de admin_audit_log
├── maintenance/route.ts      ← GET (estado), POST (toggle, exige TOTP) del modo mantenimiento
├── ops/                      ← Central de operaciones (scraping → staging → promotions)
│   ├── overview/route.ts             ← GET: resumen por banco (pendientes, activas, último fetch)
│   ├── fetch/route.ts                ← POST: corre el scraper server-side y auto-importa a staging
│   ├── import/route.ts               ← POST: sube JSON de scraper (ejecutado localmente) a staging
│   ├── suggest-merchant/route.ts     ← POST: sugerencias de comercio/categoría (IA o matching)
│   ├── [bankId]/
│   │   ├── staging/route.ts          ← GET: cola de staging de un banco por status
│   │   ├── approve-all/route.ts      ← POST: aprobación masiva (respuesta única al final)
│   │   ├── approve-all/stream/route.ts ← POST: misma aprobación masiva, progreso vía SSE
│   │   └── reject-all/route.ts       ← POST: rechazo masivo de todo lo pendiente del banco
│   └── staging/[id]/
│       ├── approve/route.ts          ← POST: aprueba una fila (resuelve/crea comercio + overrides)
│       ├── reject/route.ts           ← POST: rechaza una fila
│       └── autofill/route.ts         ← POST: IA sugiere todos los campos desde el texto de condiciones
└── data/
    ├── banks/route.ts + [id]/route.ts + [id]/deps/route.ts
    ├── cards/route.ts + [id]/route.ts
    ├── categories/route.ts + [id]/route.ts + [id]/deps/route.ts
    ├── merchants/route.ts + [id]/route.ts + [id]/deps/route.ts
    └── promotions/route.ts + [id]/route.ts + bulk-delete/route.ts

lib/
├── admin-types.ts            ← Interfaces: AdminUser, AdminSessionPayload
├── admin-auth.ts             ← bcryptjs + otpauth (Node.js only, server-only)
├── admin-crypto.ts           ← Cifrado AES-256-GCM de secretos TOTP en reposo (Node.js)
├── admin-guard.ts            ← requireAdmin() (validación contra DB) + rate limiting compartido
├── admin-session.ts          ← HMAC-SHA256 + cookie helpers (edge-compatible, server-only)
├── admin-log.ts              ← logAdminAction(): inserta en admin_audit_log (best-effort, no bloquea)
├── maintenance.ts            ← isMaintenanceMode()/setMaintenanceMode() — cache 30s, falla abierto
└── staging.ts                ← normalizeRow()/promoId()/slugify(): shape común scraper → promo_staging

scripts/
├── create-admin.ts           ← CLI: crea el primer administrador (bootstrap, marcado is_root=true)
└── encrypt-totp.ts           ← CLI: migra secretos TOTP en texto plano a cifrado (idempotente)
```

> **Central de operaciones (scraping).** El flujo completo scraper → staging →
> revisión humana → `promotions` está documentado en detalle en
> [`docs/SCRAPING.md`](./SCRAPING.md). Esta sección solo cubre la superficie
> del panel admin (rutas y endpoints); para el funcionamiento de cada scraper
> individual, el formato de `promo_staging` y los "casos borde" (cashback,
> 2x1, multitramo) ver ese documento.

> **Creación de administradores.** Ya no existe una página web pública de
> setup. El **primer** admin se crea con el CLI `npm run admin:create` (acceso
> operador con la DB); **todos los demás** se crean desde dentro del panel
> autenticado en `/admin/users/new`.

### Flujo de datos

```
Browser → proxy.ts (Edge) → /admin/* pages
                          ↓
                  getAdminFromRequest()
                  [verifica cookie HMAC]
                          ↓ inválida
                  redirect /admin/login

Browser → /api/admin/* → Route Handler (Node.js)
                        ↓
              requireAdmin()
              [valida cookie HMAC + re-consulta la DB:
               existe, totp_enabled, token_version]
              401 si no hay sesión válida (fail closed)
                        ↓
              sql`...` → Neon PostgreSQL
```

---

## Autenticación

### Flujo de login

```
1. POST /api/admin/auth/login  { email, password }
   ├── Rate limit: 5 intentos por IP cada 15 min (tabla admin_login_attempts)
   ├── bcrypt.compare() — siempre corre, incluso si el email no existe
   │   (anti-enumeración: mismo tiempo de respuesta para email inválido)
   ├── Si totp_enabled = false
   │   └── Emite sesión completa (8h) → frontend redirige a /admin/totp-setup
   └── Si totp_enabled = true
       └── Emite pending-MFA token (5 min, firmado con HMAC-SHA256)
           ├── Respuesta: { status: "mfa_required", mfa_token }
           └── Frontend muestra campo de código TOTP

2. POST /api/admin/auth/verify-totp  { mfa_token, code }
   ├── Rate limit: mismo presupuesto por IP que el paso 1 (5 fallos / 15 min)
   │   → evita fuerza bruta del código TOTP de 6 dígitos
   ├── Verifica firma HMAC del pending-MFA token
   ├── Verifica código TOTP (±1 ventana de 30s = ±30s tolerancia de reloj)
   └── Emite sesión completa (8h): UPDATE last_login_at + SET cookie
```

> **Rate limiting unificado.** Todos los endpoints que verifican una credencial
> o un código comparten el mismo presupuesto por IP (`lib/admin-guard.ts`):
> `login`, `verify-totp`, el enrolamiento `users/[id]/totp-setup`, el step-up
> re-auth de `PATCH users/[id]`, y los dos endpoints que exigen TOTP en cada
> llamada (`maintenance` y `promotions/bulk-delete`). Ningún paso queda como
> superficie de fuerza bruta sin throttle.

### Token de sesión

Formato: `base64url(JSON_payload) + "." + base64url(HMAC-SHA256)`

```json
{
  "adminId": "admin-abc123",
  "email": "admin@example.com",
  "totp_enabled": true,
  "exp": 1749600000000
}
```

- Firmado con `ADMIN_SESSION_SECRET` usando Web Crypto API (`crypto.subtle.sign`)
- Verificado en cada request en `proxy.ts` (Edge Runtime) y en cada Route Handler
- `exp` es timestamp Unix en ms; expirado = rechazado

### Cookie de sesión

| Atributo | Valor |
|---|---|
| Nombre | `ow_admin_session` |
| HttpOnly | ✓ (no accesible desde JS) |
| Secure | ✓ en producción (HTTPS) |
| SameSite | `Strict` |
| Path | `/` (debe cubrir `/api/admin/*`, no solo las páginas `/admin`) |
| Max-Age | 28800 (8 horas) |

### Enrolamiento TOTP

El flujo para un admin recién creado:

```
1. Admin se loguea con contraseña (totp_enabled = false)
2. Recibe sesión completa + proxy.ts redirige a /admin/totp-setup
3. GET /api/admin/users/[id]/totp-setup → { qr_data_url, totp_uri }
4. Admin escanea QR con Google Authenticator
5. POST /api/admin/users/[id]/totp-setup  { code }
   ├── verifyTotp(secret, code) — ±1 ventana
   ├── UPDATE admin_users SET totp_enabled = true
   └── Emite nueva cookie con totp_enabled = true
6. proxy.ts ya no redirige → acceso completo al panel
```

---

## Compartimentalización del código

Los módulos que contienen lógica sensible de servidor están marcados con `import "server-only"`:

| Módulo | Razón |
|---|---|
| `lib/admin-auth.ts` | Usa `bcryptjs` y `otpauth` — no son seguros ni funcionales en el browser |
| `lib/admin-session.ts` | Maneja cookies y tokens HMAC — nunca debe estar en el bundle del cliente |
| `lib/admin-guard.ts` | `requireAdmin()` + rate limiting tocan la DB — solo servidor |
| `lib/admin-log.ts` | Escribe en `admin_audit_log` vía `sql` — solo servidor |
| `lib/maintenance.ts` | Lee/escribe el flag de mantenimiento en `app_settings` vía `sql` — solo servidor |
| `lib/db.ts` | Cliente de base de datos — exponer la conexión en el cliente sería un desastre |

`lib/admin-crypto.ts` no usa `import "server-only"` pero queda igualmente
confinado al servidor: importa `node:crypto`, que **no se puede bundlear para el
browser** — importarlo desde un Client Component es un error de build. Así, ni la
lógica del cifrado ni la clave llegan jamás al bundle del cliente.

Si un Client Component (`"use client"`) importa cualquiera de estos módulos, Next.js lanzará un error en build time:

```
Error: You're importing a component that needs server-only
```

Esto previene fugas accidentales de lógica de autenticación o credenciales al bundle del cliente.

---

## Walkthrough: primer despliegue

### 0. Prerrequisitos

- Cuenta en [Neon](https://console.neon.tech) con un proyecto PostgreSQL creado
- Cuenta en [Vercel](https://vercel.com) con el repositorio conectado
- Node.js 20+ instalado localmente (para el script `admin:create`)

### 1. Generar el secreto de sesión

```bash
openssl rand -hex 32
# Output: algo como: a3f8c2e9d1b4a7f6e5d4c3b2a1908070605040302010f0e0d0c0b0a09080706
```

Guarda este valor — lo necesitarás en el paso 3 y 4.

### 2. Aplicar el schema de base de datos

En tu máquina local, crea `.env.local` con:

```bash
DATABASE_URL="postgresql://user:password@host.neon.tech/dbname?sslmode=require"
ADMIN_SESSION_SECRET="<tu-secreto-del-paso-1>"
```

Luego aplica el schema:

```bash
npm run db:schema
```

Esto ejecuta `scripts/apply-schema.ts` que crea todas las tablas si no existen (idempotente — no destruye datos existentes). Verás en la consola de Neon las tablas:
- `banks`, `cards`, `merchant_categories`, `merchants`, `promotions` (tablas de datos)
- `admin_users` (administradores)
- `admin_login_attempts` (rate limiting)

Verifica:
```sql
-- En la consola SQL de Neon:
SELECT * FROM admin_users;
-- Debe retornar 0 filas (vacío)
```

### 3. Crear el primer administrador

```bash
npm run admin:create
```

El script te pedirá:
1. **Email** del administrador
2. **Contraseña** (input oculto, no se muestra mientras escribes)

Luego:
- Genera un secreto TOTP aleatorio (base32, 160 bits)
- Hashea la contraseña con bcrypt (costo 12)
- Inserta la fila en `admin_users`
- Imprime el código QR en ASCII en la terminal

```
Admin creado: admin-a1b2c3
Email: admin@tu-dominio.com

Escanea este QR con Google Authenticator:

█████████████████████████████████████
█ ▄▄▄▄▄ █▀▄▀ ▄ ▀▄▄▄▀█▄▄█ ▄▄▄▄▄ █
...

O usa el URI manualmente: otpauth://totp/OptiWallet:admin@tu-dominio.com?...
```

> **Importante:** el QR solo se muestra una vez. Si lo pierdes, usa `npm run admin:create` para crear otro admin, o resetea el TOTP desde el panel.

Abre Google Authenticator → "+" → "Escanear código QR" → escanea el QR de la terminal.

### 4. Configurar variables de entorno en Vercel

En el dashboard de Vercel → tu proyecto → **Settings → Environment Variables**, agrega:

| Variable | Valor | Entornos |
|---|---|---|
| `DATABASE_URL` | Connection string de Neon | Production, Preview, Development |
| `ADMIN_SESSION_SECRET` | El secreto del paso 1 (`openssl rand -hex 32`) | Production, Preview, Development |
| `ADMIN_TOTP_ENC_KEY` | Clave dedicada para cifrar secretos TOTP (`openssl rand -hex 32`). Recomendada; si se omite se deriva de `ADMIN_SESSION_SECRET` | Production, Preview, Development |
| `NEXT_PUBLIC_SENTRY_DSN` | (opcional) DSN de Sentry | Production |
| `NEXT_PUBLIC_PLAUSIBLE_SRC` | (opcional) `src` del snippet **v2** de Plausible (Install → Script) | Production |

> **Seguridad:** ni `ADMIN_SESSION_SECRET` ni `ADMIN_TOTP_ENC_KEY` llevan el prefijo `NEXT_PUBLIC_` — nunca se exponen al browser. Las `NEXT_PUBLIC_*` se inyectan en **build**, así que cualquier cambio exige redeploy.

> **El `ADMIN_TOTP_ENC_KEY` debe ser idéntico** entre la máquina donde corres `admin:create` y Vercel: el `totp_secret` se cifra con esa clave al crear el admin, y si en prod difiere el login no podrá descifrarlo. Ver [Inventario y rotación de claves](#inventario-y-rotación-de-claves).

> **Migración de secretos existentes.** Si ya tenías admins creados antes de
> activar el cifrado, sus `totp_secret` están en texto plano. Córrelos al
> formato cifrado (idempotente) con `npm run admin:encrypt-totp`. El sistema
> sigue funcionando con filas en texto plano mientras tanto.

> **Columna `token_version` (revocación de sesión).** `npm run db:schema` (paso 2)
> la agrega con `ADD COLUMN IF NOT EXISTS` — idempotente, no destruye datos. Si
> actualizas un deploy existente, vuelve a correr `db:schema` antes de desplegar
> el código nuevo (el código es self-healing: funciona aunque la columna aún no
> exista, solo que la revocación queda inactiva hasta migrar).

### 5. Deploy

```bash
git push origin main
```

Vercel ejecuta `npm run build` automáticamente. Cuando el build termine:

1. Visita `https://tu-app.vercel.app/admin`
2. Serás redirigido a `/admin/login`
3. Ingresa email + contraseña
4. Si `totp_enabled = false`, serás redirigido a `/admin/totp-setup` para escanear el QR (el mismo que apareció en la terminal)
5. Ingresa el código de 6 dígitos de Google Authenticator
6. ✓ Acceso completo al panel

### 6. Checklist post-deploy

- [ ] Login funciona con contraseña correcta
- [ ] Contraseña incorrecta retorna error genérico (sin revelar si el email existe)
- [ ] 5 intentos fallidos bloquean el IP por 15 minutos
- [ ] TOTP funciona con el código de Google Authenticator
- [ ] `/admin` sin cookie redirige a `/admin/login` (307)
- [ ] `GET /api/admin/data/banks` sin cookie retorna 401
- [ ] CRUD: crear un banco de prueba → se refleja en `GET /api/banks`
- [ ] CRUD: crear una categoría → se ve en `GET /api/categories`
- [ ] Borrar un banco con tarjetas asociadas muestra el modal de dependencias

---

## Walkthrough: uso diario

### Login

1. Ve a `/admin/login`
2. Ingresa email y contraseña → "Continuar"
3. Si es correcto, aparece el campo de código TOTP
4. Abre Google Authenticator → copia el código de 6 dígitos
5. Ingresa el código → "Verificar"
6. Sesión válida por **8 horas**

> Si el código expira mientras lo tipeas (cada 30s), el siguiente código también funciona (ventana de ±1 paso).

### Central de operaciones (scraping)

`Panel → Operaciones → Central` (`/admin/ops`) es la vista de control del pipeline **scraper → staging → revisión → `promotions`**. Documentación completa del pipeline en [`docs/SCRAPING.md`](./SCRAPING.md); aquí solo el flujo dentro del panel.

**Resumen por banco:** la tabla muestra, por cada banco, cuántas promos están pendientes de revisión, cuántas activas en producción, la fecha del último fetch/import y los "casos borde" detectados (no entran a staging — quedan en `scripts/scrapers/out/`).

**Traer datos nuevos (Fetch):**
- Bancos con scraper server-side configurado (hoy: `banco-chile`) muestran un botón **Fetch** que corre el scraper directamente desde Vercel y auto-importa el resultado a staging.
- Si el sitio del banco bloquea la conexión (anti-bot Imperva), el panel pide pegar la cookie del navegador (`DevTools → Network → header Cookie`) y reintenta — la cookie exitosa se guarda para fetches futuros.
- Bancos "solo script local" (`bci`, `itau`) no se pueden ejecutar desde Vercel: corre el script localmente (`node scripts/scrapers/<banco>.mjs`) y sube el JSON resultante con **+ Importar datos** (`/admin/ops/import`).

**Revisar la cola de un banco:** `Panel → Operaciones → Central → Revisar →` lleva a `/admin/ops/[bankId]`, la cola de promos en staging (`pending`) de ese banco:
- **Aprobar individual**: resuelve o crea el comercio, permite corregir cualquier campo antes de insertar en `promotions` (overrides).
- **Autofill con IA**: sugiere todos los campos editables a partir del texto de condiciones (requiere IA configurada — `lib/ai/provider.ts` — si no, retorna 503).
- **Rechazar individual**: marca la fila como `rejected`, no entra a producción.
- **Aprobar todo / Rechazar todo**: operaciones masivas sobre todo el pendiente del banco. "Aprobar todo" abre la **consola de progreso en vivo** (`TerminalConsole`, ventana estilo terminal) que muestra cada paso en tiempo real vía streaming SSE — incluyendo comercios y categorías nuevos creados automáticamente por IA durante la aprobación.

**Duplicados:** cada fila se deduplica contra staging existente del mismo banco por `fingerprint` (hash estable del contenido) — un fetch repetido no genera filas duplicadas.

### Modo mantenimiento

El panel **Modo mantenimiento** vive en la parte superior de `/admin/ops` (Central de operaciones), no en el dashboard. Cuando está activo, todos los visitantes públicos son redirigidos a `/mantencion` (ver `proxy.ts`); el panel admin sigue siendo accesible para poder desactivarlo.

- Requiere el código TOTP del admin en **cada** cambio de estado (activar o desactivar) — no solo en el login — porque el impacto es inmediato y global.
- Muestra el último cambio (fecha + admin responsable).
- `GET /api/admin/maintenance` para leer el estado; `POST` con `{ enabled, totp_code }` para cambiarlo.

### Gestión de datos

Cada entidad tiene su propia página CRUD en el menú lateral:

```
Panel → Bancos
     → Tarjetas
     → Categorías
     → Comercios
     → Promociones
```

**Crear un registro:**
1. Haz clic en "Nuevo [entidad]" en la parte superior de la tabla
2. Completa el formulario inline
3. "Guardar" → el registro aparece en la tabla

**Editar un registro:**
1. Haz clic en la fila o en el ícono de edición
2. El formulario se llena con los valores actuales
3. Modifica los campos → "Guardar"

**Eliminar un registro:**
1. Haz clic en el ícono de eliminar (basura)
2. Si el registro tiene dependencias, aparece un modal bloqueante que lista todos los registros afectados (ej: si eliminas un banco, lista sus tarjetas y promociones)
3. Si no tiene dependencias, aparece un diálogo de confirmación simple
4. Confirma → el registro se elimina

**Eliminación masiva de promociones:** la tabla de Promociones permite seleccionar varias filas y borrarlas en lote desde `POST /api/admin/data/promotions/bulk-delete`. A diferencia del resto del CRUD (que reusa la sesión), este endpoint exige el código TOTP del admin en el momento del borrado — una eliminación masiva es difícil de revertir, así que no basta con la cookie de sesión.

**Renombrar una categoría (cambio de ID):** `PATCH /api/admin/data/categories/[id]` con `new_id` distinto del actual renombra el slug. Por defecto reasigna en cascada (`cascade: true`) todos los comercios de la categoría vieja a la nueva; con `cascade: false` el slug viejo se libera sin reasignar nada.

> **Dependencias (jerarquía):**
> - Banco → puede tener Tarjetas + Promociones
> - Categoría → puede tener Comercios
> - Comercio → puede tener Promociones
> - Tarjeta / Promoción → no tienen dependencias (nodos hoja)
>
> Nota: las tarjetas tienen un tercer `type` además de `credit`/`debit`: **`prepaid`** (tarjetas prepago). Aplica también a `card_types` en promociones.

### Gestión de administradores

**Ver admins:** Panel → Usuarios → lista de todos los admins

**Crear admin:**
1. Panel → Usuarios → "Nuevo admin"
2. Ingresa email + contraseña
3. Al guardar, aparece el QR de TOTP para el nuevo admin
4. El nuevo admin debe escanear el QR y verificar un código en su primer login

**Cambiar contraseña:**
1. Panel → Usuarios → clic en el admin → "Cambiar contraseña"
2. Ingresa **tu** contraseña actual (step-up re-auth) + la nueva contraseña
3. Al guardar, las sesiones vigentes del admin objetivo se invalidan (token_version++); deberá iniciar sesión de nuevo

**Resetear TOTP:**
1. Panel → Usuarios → clic en el admin → "Resetear TOTP"
2. Ingresa **tu** contraseña actual (step-up re-auth) y confirma → se genera un nuevo secreto TOTP y `totp_enabled` vuelve a `false`
3. La sesión activa del admin queda invalidada a nivel de API de inmediato: `requireAdmin()` exige `totp_enabled = true` en la DB, así que cualquier request a `/api/admin/*` devuelve 401 hasta re-enrollar. En el frontend, `/api/admin/auth/me` refleja el estado y redirige a setup.
4. El admin debe hacer login nuevamente y enrollar el nuevo TOTP

**Eliminar admin:**
- No puedes eliminarte a ti mismo
- No puedes eliminar el último admin (quedarías sin acceso)
- No puedes eliminar un admin con `is_root = true` — es el admin bootstrapeado por `npm run admin:create` (siempre el de `created_at` más antiguo), marcado como protegido para que el panel nunca quede sin un admin "de origen" recuperable solo por CLI

### Registro de actividad

`Panel → Sistema → Registro de actividad` (`/admin/audit`) muestra la bitácora de auditoría: hasta 500 entradas de los últimos 30 días, más reciente primero. Filtrable por admin, acción, tipo de entidad y texto libre (detalle, IP, ID); soporta auto-refresh configurable (10s a 10min). Cada acción administrativa relevante (login, login fallido, logout, CRUD de datos, cambios de admin, 2FA, import/approve/reject de staging, toggle de mantenimiento) queda registrada vía `logAdminAction()` — best-effort: un fallo al escribir la bitácora nunca bloquea la acción real.

### Cerrar sesión

Panel → "Cerrar sesión" (en el sidebar) → cookie eliminada → redirige a `/admin/login`

---

## API Reference — Admin

Todos los endpoints requieren cookie `ow_admin_session` válida, excepto `/api/admin/auth/login` y `/api/admin/auth/verify-totp`. Todos los endpoints de datos retornan `Cache-Control: no-store`.

### Auth

#### `POST /api/admin/auth/login`

```json
// Request
{ "email": "admin@example.com", "password": "tu-contraseña" }

// Response: TOTP requerido
{ "status": "mfa_required", "mfa_token": "<hmac-token-5min>" }

// Response: sin TOTP (primer login)
// + Set-Cookie: ow_admin_session=...
{ "status": "ok", "totp_enabled": false }
```

**Rate limit:** 5 intentos fallidos por IP cada 15 minutos. Al superar:
```json
{ "error": "Demasiados intentos. Espera 15 minutos." }  // 429
```

Error de credenciales (mismo mensaje para email inválido Y contraseña incorrecta):
```json
{ "error": "Credenciales inválidas" }  // 401
```

#### `POST /api/admin/auth/verify-totp`

```json
// Request
{ "mfa_token": "<token-del-paso-anterior>", "code": "123456" }

// Response (éxito)
// + Set-Cookie: ow_admin_session=...
{ "status": "ok" }

// Response (error)
{ "error": "Código inválido" }  // 401
```

#### `POST /api/admin/auth/logout`

```
// No body requerido
// Response: 200 OK + cookie eliminada
```

#### `GET /api/admin/auth/me`

```json
// Response (sesión válida)
{ "id": "admin-abc123", "email": "admin@example.com", "totp_enabled": true }

// Response (sin sesión)
{ "error": "No autenticado" }  // 401
```

### Admin Users

#### `GET /api/admin/users`

```json
[
  {
    "id": "admin-abc123",
    "email": "admin@example.com",
    "totp_enabled": true,
    "is_root": true,
    "created_at": "2026-06-13T00:00:00Z",
    "last_login_at": "2026-06-13T10:00:00Z"
  }
]
// Nunca incluye password_hash ni totp_secret
// is_root: true solo para el admin bootstrapeado por `npm run admin:create`
// (el de created_at más antiguo) — está protegido contra DELETE.
```

#### `POST /api/admin/users`

```json
// Request
{ "email": "nuevo@example.com", "password": "contraseña-segura" }

// Response: 201
{
  "id": "admin-xyz789",
  "email": "nuevo@example.com",
  "qr_data_url": "data:image/png;base64,...",
  "totp_uri": "otpauth://totp/OptiWallet:nuevo@example.com?..."
}
```

#### `GET /api/admin/users/[id]`

```json
{
  "id": "admin-abc123",
  "email": "admin@example.com",
  "totp_enabled": true,
  "created_at": "2026-06-13T00:00:00Z",
  "last_login_at": "2026-06-13T10:00:00Z"
}
```

#### `PATCH /api/admin/users/[id]`

Ambas operaciones (cambiar contraseña, resetear TOTP) exigen `current_password`:
la contraseña **actual del admin que ejecuta la acción** (step-up re-auth). Una
cookie robada por sí sola ya no basta. Throttled con el presupuesto de rate limit.

Cambiar contraseña:
```json
// Request
{ "current_password": "tu-contraseña-actual", "password": "nueva-min-12-chars" }
// Response — invalida las sesiones vigentes del admin objetivo (token_version++)
{ "status": "ok" }
```

Resetear TOTP:
```json
// Request
{ "current_password": "tu-contraseña-actual", "reset_totp": true }
// Response — el secreto nuevo se entrega en el próximo login vía /totp-setup
{ "status": "ok" }
```

Errores de re-auth:
```json
{ "error": "Debes confirmar tu contraseña actual" }     // 400
{ "error": "Contraseña actual incorrecta" }             // 401
{ "error": "Demasiados intentos. Espera 15 minutos." }  // 429
```

#### `DELETE /api/admin/users/[id]`

Guards:
- 400 si `id` coincide con la sesión activa (self-delete)
- 400 si solo queda 1 admin en la tabla (last-admin guard)
- 400 si el admin objetivo tiene `is_root = true` (no se puede eliminar al admin bootstrapeado por CLI)

```json
// Éxito
{ "status": "ok" }

// Error (admin protegido)
{ "error": "Este administrador está protegido y no puede ser eliminado" }  // 400
```

#### `GET /api/admin/users/[id]/totp-setup`

Solo el propio admin (`session.adminId === id`). Devuelve `400 { "error": "TOTP ya
está activo" }` si el 2FA ya está habilitado: el secreto es un bearer credential y
no se re-expone una vez enrolado (para re-enrolar, un admin debe resetear el TOTP).

```json
{
  "qr_data_url": "data:image/png;base64,...",
  "totp_uri": "otpauth://totp/OptiWallet:email@example.com?secret=...&issuer=OptiWallet"
}
```

#### `POST /api/admin/users/[id]/totp-setup`

```json
// Request
{ "code": "123456" }

// Éxito: emite nueva cookie con totp_enabled: true
{ "status": "ok" }

// Error
{ "error": "Código inválido" }  // 401
```

### Data API — Bancos

#### `GET /api/admin/data/banks`

```json
[{ "id": "bci", "name": "BCI", "short_name": "BCI", "available": true, "color": "#0033A0" }]
```

`color` es opcional (hex de 6 dígitos, ej. `#FF0000`) — color de marca usado por `BANK_INFO`-style UI. Puede ser `null`.

#### `POST /api/admin/data/banks`

```json
// Request
{ "id": "banco-nuevo", "name": "Banco Nuevo", "short_name": "BN", "available": false, "color": "#112233" }
// Response: 201 + { "id": "banco-nuevo" }
```

`available: true` se rechaza con 400 al crear — un banco nuevo no puede activarse sin tener al menos una tarjeta asociada primero (créalo inactivo, agrega tarjetas, luego actívalo con PATCH).

#### `GET /api/admin/data/banks/[id]`

Retorna un banco por ID.

#### `PATCH /api/admin/data/banks/[id]`

Actualiza solo los campos enviados:
```json
{ "name": "Nuevo Nombre", "available": true, "color": "#112233" }
```

Igual que en POST: `available: true` se rechaza con 400 si el banco no tiene ninguna tarjeta asociada.

#### `DELETE /api/admin/data/banks/[id]`

Sin `?confirmed=true`: verifica dependencias primero:
```json
// Si tiene dependencias (o no) → 409, siempre exige confirmed=true explícito
{
  "error": "Tiene dependencias",
  "cards": [{ "id": "bci-credit", "name": "BCI Credito" }],
  "promotions": [{ "id": "bci-jumbo-lunes" }]
}
```

Con `?confirmed=true`:
```json
{ "status": "ok" }
// Elimina el banco (las tarjetas y promociones con FK a este banco también
// fallarán si no se eliminaron antes — el schema NO tiene ON DELETE CASCADE)
```

#### `GET /api/admin/data/banks/[id]/deps`

```json
{
  "cards": [...],
  "promotions": [...]
}
```

### Data API — Tarjetas

`GET/POST /api/admin/data/cards` — igual que bancos pero el body incluye `bank_id` y `type` (`"credit"`, `"debit"` o `"prepaid"`).

`GET/PATCH/DELETE /api/admin/data/cards/[id]` — sin endpoint `/deps` (las tarjetas no tienen dependencias en el schema).

### Data API — Categorías

`GET/POST /api/admin/data/categories` — campos: `id`, `label`, `emoji`. `GET` (lista) incluye `merchant_count` por categoría.

`GET/PATCH/DELETE /api/admin/data/categories/[id]` — DELETE con `?confirmed=true` igual que bancos.

`PATCH` también permite **renombrar el ID** (slug) de la categoría: enviando `new_id` distinto del actual, crea la categoría con el nuevo id, reasigna en cascada los comercios (`cascade: true` por defecto, desactivable con `cascade: false`) y elimina el id viejo. Respuesta: `{ "status": "ok", "new_id": "...", "cascade": true, "merchants_updated": 12 }`.

`GET /api/admin/data/categories/[id]/deps` → `{ merchants: [...] }`

### Data API — Comercios

`GET /api/admin/data/merchants` — acepta query param `?category=slug` para filtrar por categoría.

`POST /api/admin/data/merchants`:
```json
{
  "id": "jumbo",
  "name": "Jumbo",
  "category_id": "supermercados",
  "aliases": ["Jumbo S.A.", "Cencosud"]
}
```
`name` tiene un largo máximo (`MERCHANT_NAME_MAX_LENGTH`, definido en `lib/staging.ts`) — 400 si se excede.

`GET /api/admin/data/merchants/[id]/deps` → `{ promotions: [...] }`

### Data API — Promociones

`GET /api/admin/data/promotions` — acepta query params:
- `?bankId=bci` — filtra por banco
- `?merchantId=jumbo` — filtra por comercio
- `?active=true|false` — filtra por estado

`POST /api/admin/data/promotions`:
```json
{
  "id": "bci-jumbo-lunes",
  "bank_id": "bci",
  "card_types": ["credit"],
  "card_ids": [],
  "merchant_id": "jumbo",
  "discount": 20,
  "discount_per_unit": null,
  "discount_unit": null,
  "stackable": false,
  "cap": 5000,
  "min_purchase": 10000,
  "days_of_week": [1],
  "start_date": "2026-01-01",
  "end_date": "2026-12-31",
  "modality": "presencial",
  "code": null,
  "conditions": "Máximo 1 uso por semana",
  "source": "https://www.bci.cl/",
  "verified_at": "2026-06-01",
  "active": true
}
```

- `days_of_week`: array de enteros 0-6 (0=domingo, 1=lunes, ..., 6=sábado). Array vacío = todos los días.
- `card_types`: array no vacío de `"credit"` / `"debit"` / `"prepaid"`.
- `card_ids`: opcional, default `[]`. Si no está vacío, la promo aplica **únicamente** a esas tarjetas exactas ("tarjeta única") y `card_types` se ignora como filtro de matching — ver `promoAppliesToCard` en `lib/recommendations.ts`.
- **Descuento — exactamente uno de los dos mecanismos** (constraint `promotions_discount_xor` en DB):
  - `discount`: porcentaje 1-100 (`discount_per_unit`/`discount_unit` deben ser `null`), o
  - `discount_per_unit` + `discount_unit`: descuento fijo por unidad (hoy solo `discount_unit: "liter"`, ej. $X por litro de bencina) — `discount` debe ser `null`.
- `stackable`: si la promo puede combinarse (apilarse) con otras simultáneamente — usado por `calculateStackedSavings`.
- `modality`: `"presencial"` | `"online"` | `"both"`
- `cap`: tope en pesos chilenos (null = sin tope)
- `min_purchase`: mínimo de compra en pesos (null = sin mínimo)

`PATCH /api/admin/data/promotions/[id]` — actualiza solo los campos enviados; valida el constraint XOR de descuento sobre el resultado fusionado (campo enviado + campos existentes).

`DELETE /api/admin/data/promotions/[id]` — las promociones son nodos hoja, no tienen dependencias. Elimina directamente (sin modal).

#### `POST /api/admin/data/promotions/bulk-delete`

Eliminación masiva — usada por la selección múltiple en la tabla de Promociones. A diferencia del resto de los endpoints de datos, **exige el código TOTP del admin actual** en cada llamada (no solo la cookie de sesión), por el alcance potencialmente grande e irreversible de la operación.

```json
// Request
{ "ids": ["bci-jumbo-lunes", "bci-jumbo-martes"], "code": "123456" }

// Éxito
{ "status": "ok" }

// Errores
{ "error": "IDs de promociones requeridos" }       // 400
{ "error": "Código TOTP requerido" }                // 400
{ "error": "Código de verificación inválido" }      // 401
{ "error": "Demasiados intentos. Espera 15 minutos." } // 429
```

### Audit / Maintenance / Ops APIs

#### `GET /api/admin/audit`

```json
[
  {
    "id": 4821,
    "admin_id": "admin-abc123",
    "admin_email": "admin@example.com",
    "action": "delete",
    "entity_type": "promotion",
    "entity_id": "bci-jumbo-lunes",
    "detail": "Promoción eliminada",
    "ip_address": "190.12.34.56",
    "created_at": "2026-06-29T14:02:11Z"
  }
]
```
Últimas 500 entradas dentro de los últimos 30 días, más reciente primero. Sin paginación ni filtros server-side — el filtrado (admin, acción, entidad, texto libre) ocurre client-side sobre este array en `/admin/audit`.

#### `GET /api/admin/maintenance`

```json
{ "enabled": false, "updatedAt": "2026-06-20T10:00:00Z", "updatedBy": "admin@example.com" }
```

#### `POST /api/admin/maintenance`

```json
// Request — el código TOTP se exige en cada cambio de estado, no solo en el login
{ "enabled": true, "totp_code": "123456" }

// Éxito
{ "ok": true, "enabled": true }

// Errores
{ "error": "Código TOTP de 6 dígitos requerido" }  // 400
{ "error": "Código TOTP incorrecto" }              // 401
{ "error": "Demasiados intentos. Espera 15 minutos." } // 429
```

#### Ops — Central de operaciones

Todos requieren sesión admin (`requireAdmin`). Resumen funcional (detalle completo en [`docs/SCRAPING.md`](./SCRAPING.md)):

| Endpoint | Método | Propósito |
|---|---|---|
| `/api/admin/ops/overview` | GET | Resumen por banco: pendientes, activas, último fetch, casos borde |
| `/api/admin/ops/fetch` | POST | Corre el scraper de un banco server-side (`{ bank_id, cookie? }`); auto-importa a staging. `428` si el sitio del banco exige cookie (anti-bot Imperva) |
| `/api/admin/ops/import` | POST | Sube el JSON de un scraper corrido localmente (`{ bank_id, clean[], edge_counts? }`, máx 5000 filas) a staging |
| `/api/admin/ops/suggest-merchant` | POST | Sugerencias de comercio existente (matching/embeddings) + categoría propuesta (IA) para resolver una fila de staging |
| `/api/admin/ops/[bankId]/staging` | GET | Lista las filas de staging de un banco (`?status=pending\|approved\|rejected`) |
| `/api/admin/ops/[bankId]/approve-all` | POST | Aprobación masiva de todo lo pendiente del banco — respuesta única al terminar |
| `/api/admin/ops/[bankId]/approve-all/stream` | POST | Misma aprobación masiva, pero responde `text/event-stream` (SSE): un evento `{"type":"log",...}` por paso y un evento final `{"type":"done","summary":{...}}` — alimenta la consola `TerminalConsole` en el panel |
| `/api/admin/ops/[bankId]/reject-all` | POST | Rechaza todo lo pendiente del banco |
| `/api/admin/ops/staging/[id]/approve` | POST | Aprueba una fila: resuelve o crea el comercio, acepta `overrides` para corregir campos antes de insertar en `promotions` |
| `/api/admin/ops/staging/[id]/reject` | POST | Rechaza una fila individual |
| `/api/admin/ops/staging/[id]/autofill` | POST | IA sugiere todos los campos editables a partir del texto de condiciones de la fila. `503` si no hay proveedor de IA configurado (`lib/ai/provider.ts`) |

Tanto `approve-all` como `approve-all/stream` resuelven comercios no mapeados automáticamente: clasifican cada nombre nuevo con IA (`suggestCategoriesBatch`), crean la categoría sugerida si no existe, y crean el comercio — todo queda registrado en la bitácora de auditoría.

---

## CRUD por entidad

### Mapa de dependencias

```
banks
  └─ cards (bank_id → banks.id)
  └─ promotions (bank_id → banks.id)

merchant_categories
  └─ merchants (category_id → merchant_categories.id)
        └─ promotions (merchant_id → merchants.id)

promotions ← nodo hoja (nada depende de promotions)
cards      ← nodo hoja en el schema (nada tiene FK hacia cards)
```

### Orden seguro para poblar la base de datos desde cero

1. `banks` (sin dependencias hacia adelante)
2. `merchant_categories` (sin dependencias hacia adelante)
3. `cards` (depende de `banks`)
4. `merchants` (depende de `merchant_categories`)
5. `promotions` (depende de `banks` + `merchants`)

### Orden seguro para limpiar la base de datos

1. `promotions` (depende de `banks` + `merchants` — eliminar primero)
2. `cards` (depende de `banks`)
3. `merchants` (depende de `merchant_categories`)
4. `banks` (raíz del árbol de FK)
5. `merchant_categories` (raíz del árbol de FK)

---

## Seguridad del panel

### Medidas implementadas

| Medida | Implementación |
|---|---|
| **Hashing de contraseñas** | bcrypt costo 12 (≈300ms en hardware moderno) |
| **Cifrado de secretos TOTP en reposo** | AES-256-GCM (`lib/admin-crypto.ts`): el `totp_secret` se guarda cifrado, no en texto plano. Un dump de la DB no basta para falsificar códigos 2FA — también se necesita la clave de la app. Compatible hacia atrás con filas legacy en texto plano (migrar con `npm run admin:encrypt-totp`) |
| **Anti-enumeración de emails** | Login siempre corre bcrypt, incluso si el email no existe en la DB |
| **Rate limiting** | 5 intentos fallidos por IP en 15 min en login, verify-totp, totp-setup, step-up re-auth (`PATCH users/[id]`), `maintenance` y `promotions/bulk-delete` (tabla `admin_login_attempts`) |
| **Validación de sesión contra DB** | `requireAdmin()` re-consulta `admin_users` en cada request del API: un admin eliminado, con TOTP reseteado o cuenta deshabilitada pierde acceso de inmediato, sin esperar a que expire la cookie (8h) |
| **Política de contraseñas unificada** | Mínimo 12 caracteres en todos los flujos (setup inicial, crear admin, cambiar contraseña) |
| **TOTP obligatorio** | totp_enabled=false redirige a setup antes de dar acceso |
| **Sesión HMAC-SHA256** | Firmada con `ADMIN_SESSION_SECRET`, exp verificado en cada request |
| **Pending-MFA token** | Token separado de 5 min entre paso 1 y paso 2 del login |
| **TOTP window ±1** | Tolerancia de ±30s para desfase de reloj |
| **Cookie HttpOnly** | No accesible desde JavaScript del browser |
| **Cookie SameSite=Strict** | Previene CSRF cross-origin |
| **Cookie Path=/** | Debe cubrir tanto `/admin` (páginas) como `/api/admin` (handlers); por eso NO se restringe a `/admin` |
| **Sesión 8h** | Límite de tiempo para reducir riesgo de robo de sesión |
| **Guard self-delete** | Un admin no puede eliminarse a sí mismo |
| **Guard last-admin** | No se puede eliminar el último admin |
| **Auth en proxy.ts** | La verificación de sesión ocurre en el Edge antes de renderizar cualquier página admin |
| **Auth en Route Handlers** | `requireAdmin()` al inicio de cada handler de datos (valida cookie **y** re-consulta la DB) |
| **Step-up re-auth** | Cambiar contraseña o resetear TOTP (propio o de otro admin) exige la contraseña actual del admin que ejecuta la acción (`current_password`) — una cookie robada por sí sola ya no permite tomar control de una cuenta |
| **Revocación de sesión** | Cada token lleva el `token_version` del admin al firmarse; cambiarlo (cambio de contraseña, logout) invalida todas sus sesiones vigentes de inmediato |
| **Cache-Control: no-store** | Las respuestas del panel no se cachean en CDN |
| **Service Worker excluye admin** | El SW no intercepta `/admin` ni `/api/admin`: sus respuestas nunca entran a CacheStorage del browser |
| **server-only** | `lib/admin-auth.ts`, `lib/admin-session.ts`, `lib/admin-guard.ts`, `lib/admin-log.ts`, `lib/maintenance.ts`, `lib/db.ts` no pueden ser importados en Client Components |
| **TOTP en operaciones de alto impacto** | Activar/desactivar modo mantenimiento y la eliminación masiva de promociones exigen el código TOTP del admin en cada llamada — no solo la cookie de sesión — por su alcance global o irreversible |
| **Admin protegido (`is_root`)** | El admin bootstrapeado por `npm run admin:create` no puede eliminarse vía API ni panel, evitando quedar sin un admin recuperable solo por CLI |

### Inventario y rotación de claves

Estas son **todas** las claves que usa OptiWallet. Genera cada secreto con
`openssl rand -hex 32`. Recuerda: las `NEXT_PUBLIC_*` se hornean en build → cada
cambio exige **redeploy**.

| Clave | Dónde se lee | Qué pasa si se rota |
|---|---|---|
| `DATABASE_URL` | `lib/db.ts`, `scripts/*` | Apunta a otra DB. Rotarla = cambiar de base; los admins viven en la DB, no en la clave. |
| `ADMIN_SESSION_SECRET` | `lib/admin-session.ts` (firma HMAC de sesiones) | **Invalida todas las sesiones activas** al instante — todos vuelven a loguear. No afecta contraseñas ni TOTP. |
| `ADMIN_TOTP_ENC_KEY` | `lib/admin-crypto.ts` (cifra `totp_secret`) | **Deja ilegibles los TOTP ya guardados** → esos admins no podrán verificar su código y deberán re-enrolar (resetear TOTP). Si se omite, se deriva de `ADMIN_SESSION_SECRET`. |
| `NEXT_PUBLIC_SENTRY_DSN` | `lib/sentry.ts` | Sin ella, Sentry queda deshabilitado (cero overhead). No es secreto. |
| `NEXT_PUBLIC_PLAUSIBLE_SRC` | `app/layout.tsx` | `src` del script v2 de Plausible. Sin ella, no se inyecta analytics. No es secreto (viaja al browser). |
| `GOOGLE_PLACES_API_KEY` | `scripts/compute-merchant-popularity.ts` (**solo tooling local**, nunca runtime) | Sin ella, `npm run popularity:compute` aborta; la app y el panel corren normal. Restríngela a "Places API (New)" en GCP. No se hornea en build (no lleva `NEXT_PUBLIC_`). |

**Claves eliminadas / stale** (no las uses, bórralas si las tienes):

| Clave | Estado |
|---|---|
| `ADMIN_SETUP_TOKEN` (o "admin setup token") | **No existe.** Era de la página web de setup de un solo uso, eliminada (`feat(admin): remove web setup`). Nada en el código la lee. |
| `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` | **Reemplazada** por `NEXT_PUBLIC_PLAUSIBLE_SRC` al migrar al script v2 de Plausible (sin `data-domain`). |

#### Gotchas

- **`ADMIN_TOTP_ENC_KEY` debe coincidir** entre la máquina donde corres
  `admin:create` y Vercel. El secreto TOTP se cifra con esa clave al crear el
  admin; si en prod es distinta, el login fallará al descifrarlo. Por eso, en
  producción, **usa una clave dedicada** (no la derivada de la sesión): así rotar
  `ADMIN_SESSION_SECRET` no inutiliza los TOTP guardados.
- `ADMIN_SESSION_SECRET` y `ADMIN_TOTP_ENC_KEY` **nunca** llevan prefijo
  `NEXT_PUBLIC_` y viven solo en `.env.local` (local) y en los secrets de Vercel.

#### Rotación de una sola clave (sospecha de compromiso)

1. Genera el nuevo valor: `openssl rand -hex 32`.
2. Actualízalo en Vercel → Settings → Environment Variables.
3. Redeploy.
4. Efecto: ver la tabla de arriba (sesiones invalidadas para `ADMIN_SESSION_SECRET`; re-enrolamiento de TOTP para `ADMIN_TOTP_ENC_KEY`).

#### Rotación completa + recrear admin desde cero (clean slate)

Es el flujo ideal si borraste todos los admins (no quedan `totp_secret` viejos que se orphanen):

```bash
# 1. Genera los dos secretos nuevos
openssl rand -hex 32   # → ADMIN_SESSION_SECRET
openssl rand -hex 32   # → ADMIN_TOTP_ENC_KEY

# 2. .env.local (apuntando a la DB destino, normalmente la de prod)
#    DATABASE_URL="postgresql://...neon.tech/...?sslmode=require"
#    ADMIN_SESSION_SECRET="<hex-1>"
#    ADMIN_TOTP_ENC_KEY="<hex-2>"

# 3. Aplica/actualiza el schema (idempotente; agrega token_version si falta)
npm run db:schema

# 4. Crea el primer admin (pide email + contraseña, imprime el QR en la terminal)
npm install
npm run admin:create
```

5. Pon los **mismos** `ADMIN_SESSION_SECRET` y `ADMIN_TOTP_ENC_KEY` en Vercel y redeploy.
6. Entra a `/admin/login` → te redirige a `/admin/totp-setup` → escanea el QR → ingresa el código → listo.

> El alta de admins es **solo por CLI** (`admin:create`) o desde el panel ya
> autenticado (`/admin/users/new`). No hay página web pública de setup.

### Agregar un segundo factor de seguridad (futuro)

Para entornos de alta criticidad, considera:
- **IP allowlist** en Vercel WAF para `/admin/*`
- **VPN requirement** + IP allowlist
- **FIDO2/WebAuthn** como alternativa a TOTP (más fuerte, no suceptible a phishing)

---

## Referencia de variables de entorno

| Variable | Requerida para el panel | Descripción |
|---|---|---|
| `DATABASE_URL` | ✓ | Connection string de Neon PostgreSQL |
| `ADMIN_SESSION_SECRET` | ✓ | Secreto HMAC-SHA256 para firmar sesiones (hex, 32 bytes mínimo). Genera con: `openssl rand -hex 32` |
| `ADMIN_TOTP_ENC_KEY` | Recomendada | Clave para cifrar secretos TOTP en reposo (AES-256-GCM). Genera con: `openssl rand -hex 32`. Si se omite, se deriva de `ADMIN_SESSION_SECRET` (rotar la sesión inutilizaría los TOTP guardados) |
| `NEXT_PUBLIC_SENTRY_DSN` | No | DSN de Sentry para error tracking |
| `NEXT_PUBLIC_PLAUSIBLE_SRC` | No | `src` del snippet v2 de Plausible. Si el host NO es `plausible.io`, agrégalo a `script-src` y `connect-src` en `next.config.mjs` |

> **Nunca** commitees `ADMIN_SESSION_SECRET` ni `ADMIN_TOTP_ENC_KEY` al repositorio. Viven en `.env.local` localmente y en los secrets de Vercel en producción.

> No existe ningún "admin setup token" ni `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` — ver [Inventario y rotación de claves](#inventario-y-rotación-de-claves) para el detalle de claves vigentes y eliminadas.
