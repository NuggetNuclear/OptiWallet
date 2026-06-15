# Panel de Administración — OptiWallet

> Última actualización: 2026-06-15 · v0.1.0-beta

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

- **CRUD completo** sobre las 5 tablas de la base de datos: `banks`, `cards`, `merchant_categories`, `merchants`, `promotions`.
- **Resolución de dependencias** antes de operaciones destructivas (ver qué registros dependen de lo que vas a borrar).
- **Gestión de admins**: crear, listar, cambiar contraseña, resetear TOTP, eliminar.
- **Autenticación robusta**: contraseña + TOTP (Google Authenticator), sesión HMAC-firmada, rate limiting por IP.

---

## Arquitectura

```
app/admin/                    ← UI del panel (Next.js App Router, server + client components)
├── layout.tsx                ← Shell del admin (metadata noindex, import de admin.css)
├── admin.css                 ← Estilos scoped al panel
├── components/
│   ├── AdminNav.tsx          ← Sidebar de navegación
│   ├── AdminShell.tsx        ← Wrapper que verifica sesión (llama a /api/admin/auth/me)
│   └── DeleteModal.tsx       ← Modal de confirmación con lista de dependencias
├── login/page.tsx            ← Formulario dos fases: contraseña → código TOTP
├── totp-setup/page.tsx       ← Enrolamiento TOTP (primer login)
├── page.tsx                  ← Dashboard: estadísticas + navegación
├── users/                    ← Gestión de admins
│   ├── page.tsx
│   ├── new/page.tsx
│   └── [id]/page.tsx
└── data/                     ← CRUD de datos
    ├── banks/page.tsx
    ├── cards/page.tsx
    ├── categories/page.tsx
    ├── merchants/page.tsx
    └── promotions/page.tsx

app/api/admin/                ← API Routes del panel (todas protegidas con sesión)
├── auth/
│   ├── login/route.ts        ← POST: autenticación en dos fases
│   ├── verify-totp/route.ts  ← POST: verificación de código TOTP
│   ├── logout/route.ts       ← POST: cierre de sesión
│   └── me/route.ts           ← GET: perfil de la sesión activa
├── users/
│   ├── route.ts              ← GET (lista), POST (crear admin)
│   └── [id]/
│       ├── route.ts          ← GET, PATCH (contraseña/TOTP), DELETE
│       └── totp-setup/route.ts ← GET (QR), POST (activar TOTP)
└── data/
    ├── banks/route.ts + [id]/route.ts + [id]/deps/route.ts
    ├── cards/route.ts + [id]/route.ts
    ├── categories/route.ts + [id]/route.ts + [id]/deps/route.ts
    ├── merchants/route.ts + [id]/route.ts + [id]/deps/route.ts
    └── promotions/route.ts + [id]/route.ts

lib/
├── admin-types.ts            ← Interfaces: AdminUser, AdminSessionPayload
├── admin-auth.ts             ← bcryptjs + otpauth (Node.js only, server-only)
├── admin-crypto.ts           ← Cifrado AES-256-GCM de secretos TOTP en reposo (Node.js)
├── admin-guard.ts            ← requireAdmin() (validación contra DB) + rate limiting compartido
└── admin-session.ts          ← HMAC-SHA256 + cookie helpers (edge-compatible, server-only)

scripts/
├── create-admin.ts           ← CLI: crea el primer administrador (bootstrap)
└── encrypt-totp.ts           ← CLI: migra secretos TOTP en texto plano a cifrado (idempotente)
```

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
> `login`, `verify-totp`, el enrolamiento `users/[id]/totp-setup` y el `setup`
> inicial. Ningún paso queda como superficie de fuerza bruta sin throttle.

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
| `ADMIN_SESSION_SECRET` | El secreto del paso 1 | Production, Preview, Development |
| `ADMIN_TOTP_ENC_KEY` | Clave dedicada para cifrar secretos TOTP (`openssl rand -hex 32`). Recomendada; si se omite se deriva de `ADMIN_SESSION_SECRET` | Production, Preview, Development |
| `NEXT_PUBLIC_SENTRY_DSN` | (opcional) DSN de Sentry | Production |
| `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` | (opcional) Dominio en Plausible | Production |

> **Seguridad:** ni `ADMIN_SESSION_SECRET` ni `ADMIN_TOTP_ENC_KEY` llevan el prefijo `NEXT_PUBLIC_` — nunca se exponen al browser.

> **Migración de secretos existentes.** Si ya tenías admins creados antes de
> activar el cifrado, sus `totp_secret` están en texto plano. Córrelos al
> formato cifrado (idempotente) con `npm run admin:encrypt-totp`. El sistema
> sigue funcionando con filas en texto plano mientras tanto.

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

> **Dependencias (jerarquía):**
> - Banco → puede tener Tarjetas + Promociones
> - Categoría → puede tener Comercios
> - Comercio → puede tener Promociones
> - Tarjeta / Promoción → no tienen dependencias (nodos hoja)

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
    "created_at": "2026-06-13T00:00:00Z",
    "last_login_at": "2026-06-13T10:00:00Z"
  }
]
// Nunca incluye password_hash ni totp_secret
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

```json
// Éxito
{ "status": "ok" }
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
[{ "id": "bci", "name": "BCI", "short_name": "BCI", "available": true }]
```

#### `POST /api/admin/data/banks`

```json
// Request
{ "id": "banco-nuevo", "name": "Banco Nuevo", "short_name": "BN", "available": false }
// Response: 201 + el registro creado
```

#### `GET /api/admin/data/banks/[id]`

Retorna un banco por ID.

#### `PATCH /api/admin/data/banks/[id]`

Actualiza solo los campos enviados:
```json
{ "name": "Nuevo Nombre", "available": true }
```

#### `DELETE /api/admin/data/banks/[id]`

Sin `?confirmed=true`: verifica dependencias primero:
```json
// Si tiene dependencias → 409
{
  "error": "El banco tiene registros dependientes. Usa ?confirmed=true para forzar la eliminación.",
  "cards": [{ "id": "bci-credit", "name": "BCI Credito" }],
  "promotions": [{ "id": "bci-jumbo-lunes", "merchant_id": "jumbo" }]
}

// Sin dependencias → 409 con listas vacías (igual necesita ?confirmed=true)
```

Con `?confirmed=true`:
```json
{ "ok": true }
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

`GET/POST /api/admin/data/cards` — igual que bancos pero el body incluye `bank_id` y `type` (`"credit"` o `"debit"`).

`GET/PATCH/DELETE /api/admin/data/cards/[id]` — sin endpoint `/deps` (las tarjetas no tienen dependencias en el schema).

### Data API — Categorías

`GET/POST /api/admin/data/categories` — campos: `id`, `label`, `emoji`.

`GET/PATCH/DELETE /api/admin/data/categories/[id]` — DELETE con `?confirmed=true` igual que bancos.

`GET /api/admin/data/categories/[id]/deps` → `{ merchants: [...] }`

### Data API — Comercios

`GET /api/admin/data/merchants` — acepta query param `?q=texto` para filtrar.

`POST /api/admin/data/merchants`:
```json
{
  "id": "jumbo",
  "name": "Jumbo",
  "category_id": "supermercados",
  "aliases": ["Jumbo S.A.", "Cencosud"]
}
```

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
  "merchant_id": "jumbo",
  "discount": 20,
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
- `modality`: `"presencial"` | `"online"` | `"both"`
- `cap`: tope en pesos chilenos (null = sin tope)
- `min_purchase`: mínimo de compra en pesos (null = sin mínimo)

`PATCH /api/admin/data/promotions/[id]` — actualiza solo los campos enviados.

`DELETE /api/admin/data/promotions/[id]` — las promociones son nodos hoja, no tienen dependencias. Elimina directamente (sin modal).

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
| **Rate limiting** | 5 intentos fallidos por IP en 15 min en login, verify-totp, totp-setup y setup (tabla `admin_login_attempts`) |
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
| **server-only** | `lib/admin-auth.ts`, `lib/admin-session.ts`, `lib/db.ts` no pueden ser importados en Client Components |

### Rotación del secreto de sesión

Si sospechas que `ADMIN_SESSION_SECRET` fue comprometido:

1. Genera un nuevo secreto: `openssl rand -hex 32`
2. Actualiza la variable en Vercel → Settings → Environment Variables
3. Haz un re-deploy (o espera el siguiente deploy)

**Efecto inmediato:** todas las sesiones activas quedan invalidadas. Todos los admins deberán hacer login nuevamente.

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
| `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` | No | Dominio para analytics de Plausible |

> **Nunca** commitees `ADMIN_SESSION_SECRET` ni `ADMIN_TOTP_ENC_KEY` al repositorio. Viven en `.env.local` localmente y en los secrets de Vercel en producción.
