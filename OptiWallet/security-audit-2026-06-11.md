# OptiWallet — Security Audit Report

> ⚠️ **Histórico (2026-06-11).** Anterior al panel de administración — este
> reporte describe OptiWallet como *"API pública sin autenticación"*, lo cual
> ya no es cierto. Para la auditoría del sistema admin (auth, TOTP, sesiones)
> y el estado actual, ver [`audit-2026-06-15.md`](audit-2026-06-15.md).

**Fecha:** 2026-06-11
**Alcance:** Codebase completo (`app/`, `components/`, `lib/`, `scripts/`, `public/sw.js`, `proxy.ts`, configs, dependencias, historial git)
**Modo:** Audit + remediación — los fixes ya están aplicados en este commit
**Contexto:** App en producción (Vercel, región gru1) con Neon PostgreSQL. `DATABASE_URL` vive en los secrets de Vercel y no fue tocada.

---

## Resumen ejecutivo

La app tiene una superficie de ataque pequeña: API pública de solo lectura (solo `GET`/`SELECT`), sin autenticación, sin datos de usuario en el servidor (la wallet vive en `localStorage`). No se encontró ninguna vulnerabilidad explotable de inyección ni fuga de secrets. Los hallazgos relevantes fueron: **dependencia de Next.js con CVEs high conocidos** (incluyendo bypass de middleware — directamente aplicable porque la app usa `proxy.ts`) y **ausencia total de security headers**. Ambos quedaron corregidos.

| # | Severidad | Hallazgo | Estado |
|---|-----------|----------|--------|
| 1 | 🔴 High | Next.js 16.2.4 con 13 advisories (middleware/proxy bypass, cache poisoning, DoS, XSS) | ✅ Corregido → 16.2.9 |
| 2 | 🟠 Medium | Sin security headers (CSP, HSTS, X-Frame-Options, etc.) | ✅ Corregido |
| 3 | 🟠 Medium | `SELECT *` / `p.*` exponen columnas por defecto | ✅ Corregido |
| 4 | 🟡 Low | Sin validación de formato en IDs de query/path params | ✅ Corregido |
| 5 | 🟡 Low | Cookie `ow_standalone` sin atributo `Secure` | ✅ Corregido |
| 6 | 🔵 Info | Sin rate limiting / protección anti-bot en la API | ⚠️ Recomendación operativa |
| 7 | 🔵 Info | La app se conecta a Neon con un rol con permisos de escritura que no usa | ⚠️ Recomendación operativa |
| 8 | 🔵 Info | `brace-expansion` (dev, transitiva) moderate DoS | ✅ Corregido vía `npm audit fix` |

---

## 1. 🔴 Next.js 16.2.4 vulnerable (corregido → 16.2.9)

`npm audit` reportaba **1 high** en producción. Los advisories que afectaban a `next@16.0.0–16.2.5` incluyen:

- **Middleware/Proxy bypass** vía inyección de parámetros de ruta dinámica (GHSA-492v-c6pp-mqqv) y vía rutas segment-prefetch (GHSA-267c-6grr-h53f, GHSA-26hh-7cqf-hhc6). **Directamente relevante**: la redirección standalone de OptiWallet vive en `proxy.ts`.
- **Cache poisoning** en respuestas RSC (GHSA-wfc6-r584-vfw7, GHSA-vfv6-92ff-j949) y en redirects del proxy (GHSA-3g8h-86w9-wvmq).
- **DoS** por agotamiento de conexiones y en Server Components (GHSA-mg66-mrh9-m8jx, GHSA-8h8q-6873-q5fj).
- **XSS** en scripts `beforeInteractive` y con CSP nonces (GHSA-gx5p-jg67-6x7h, GHSA-ffhc-5mcf-pf4q).

**Fix aplicado:** `next` y `eslint-config-next` actualizados a `^16.2.9` (patch-level, sin breaking changes; mismo rango semver que ya usaba el proyecto). `npm audit` queda en **0 vulnerabilidades**. El build de producción compila limpio con 16.2.9.

> Vercel desplegará 16.2.9 automáticamente en el próximo deploy al leer el lockfile actualizado.

## 2. 🟠 Security headers ausentes (corregido)

La app no enviaba ningún security header. Se agregó en `next.config.mjs`:

- **Content-Security-Policy**: `default-src 'self'` con todo bloqueado salvo lo que la app realmente usa. Sin orígenes externos (las fuentes de `next/font` se self-hostean en build). `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`.
- **Strict-Transport-Security**: 2 años + `includeSubDomains` (Vercel ya lo manda en `*.vercel.app`; esto cubre dominios custom futuros).
- **X-Content-Type-Options** `nosniff`, **X-Frame-Options** `DENY` (legacy, redundante con `frame-ancestors`), **Referrer-Policy** `strict-origin-when-cross-origin`, **Permissions-Policy** denegando cámara/micrófono/geolocalización/payment/USB.
- **`poweredByHeader: false`** — deja de anunciar `X-Powered-By: Next.js`.

**Trade-off documentado:** `script-src` y `style-src` llevan `'unsafe-inline'` porque el App Router hidrata con `<script>` inline. La alternativa estricta (nonces por request vía `proxy.ts`) forzaría render dinámico en todas las páginas y se perdería el prerender estático de la landing. Verificado: con esta CSP las páginas siguen saliendo `○ (Static)` en el build. Si más adelante se agrega contenido de terceros (analytics, etc.), reevaluar nonces.

## 3. 🟠 `SELECT *` / `p.*` (corregido)

`/api/banks` usaba `SELECT *` y `/api/promotions/[merchantId]` usaba `p.*`. Cualquier columna futura (flags internos, notas de moderación, etc.) se filtraría sola a la API pública. Ambos quedaron con listas explícitas de columnas que coinciden 1:1 con los tipos `ApiBank` y `ApiPromotion` del cliente — `created_at`/`updated_at` ya no se exponen. (Hallazgo heredado del audit del 2026-06-10 que estaba pendiente.)

## 4. 🟡 Validación de IDs (corregido)

Las queries ya iban 100% parametrizadas (tagged templates de Neon) y el escape de comodines LIKE en `/api/merchants?q=` ya existía — **no había SQL injection**. Pero los IDs (`cardIds`, `bankId`, `category`, `merchantId`) llegaban a la base sin validación de formato. Se agregó `lib/validate.ts` (`/^[A-Za-z0-9_.-]{1,64}$/`, defensa en profundidad) y los 5 routes que reciben IDs ahora responden `400` ante input malformado antes de tocar Neon. Verificado en runtime: `/api/cards?bankId=<script>` → `400 {"error":"bankId inválido"}`.

## 5. 🟡 Cookie sin `Secure` (corregido)

`ow_standalone` se seteaba con `samesite=lax` pero sin `Secure`. Es una cookie de bajo riesgo (flag de redirección, sin sesión), pero el estándar es marcar `Secure` todo lo que viaje por HTTPS. `lib/standalone.ts` ahora agrega `; secure` cuando `location.protocol === "https:"` (condicional para no romper `next dev` en http://localhost, donde el browser ignoraría la cookie).

## 6. 🔵 Rate limiting (recomendación operativa)

La API es pública y golpea Neon en cada miss de cache. Mitigantes actuales: respuestas cacheadas en el edge (`s-maxage` en todos los routes), límite de 100 `cardIds`, `LIMIT 50` en búsquedas. Aún así, un atacante puede generar misses variando la query.

Recomendado (se configura en el dashboard de Vercel, no en código):

1. **Vercel WAF / Firewall** — regla de rate limit por IP sobre `/api/*` (p. ej. 60 req/min) y Attack Challenge Mode si hay abuso activo.
2. Si en Fase 2.2 aparecen endpoints autenticados o de escritura, ahí sí incorporar rate limiting en código (p. ej. Upstash Ratelimit).

## 7. 🔵 Rol de base de datos con privilegios de más (recomendación operativa)

Toda la API hace exclusivamente `SELECT`, pero se conecta (presumiblemente) con el rol owner de Neon, que puede escribir y alterar schema. Mejor práctica de mínimo privilegio:

```sql
CREATE ROLE optiwallet_ro WITH LOGIN PASSWORD '<generado>';
GRANT CONNECT ON DATABASE <db> TO optiwallet_ro;
GRANT USAGE ON SCHEMA public TO optiwallet_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO optiwallet_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO optiwallet_ro;
```

Luego apuntar la `DATABASE_URL` de Vercel a ese rol. Si algún día se filtra la connection string, el blast radius es lectura de datos que ya son públicos. (No lo apliqué: requiere tocar el secret en Vercel — decisión tuya.)

---

## Verificado y limpio (sin hallazgos)

- **Secrets:** nada en el working tree ni en el historial git completo (solo `.env.example` con placeholder). `.gitignore` cubre `.env*` y `*.pem`.
- **SQL injection:** todas las queries parametrizadas vía tagged templates; escape de `%`/`_`/`\` en LIKE ya presente; sin concatenación de SQL en runtime (el split por `;` de `scripts/apply-schema.ts` es tooling local de dev, corre solo con tu `.env.local`).
- **XSS:** sin `dangerouslySetInnerHTML`, `eval`, ni `innerHTML` en todo el codebase; React escapa por defecto; ahora además hay CSP.
- **Error handling:** los 500 devuelven `{"error":"Error interno"}` genérico — los detalles van a `console.error` (logs de Vercel), no al cliente. Correcto.
- **Service worker:** solo cachea GET same-origin; no intercepta orígenes externos; datos cacheados son públicos.
- **CORS:** no se abre ningún `Access-Control-Allow-Origin` — la API queda same-origin por defecto. Correcto para el caso de uso.
- **Open redirect:** `proxy.ts` redirige solo a `/app` hardcodeado, sin input del usuario en el destino.
- **Datos personales:** el servidor no almacena nada del usuario; la wallet es `localStorage` puro y solo viajan IDs de tarjetas (no PAN ni datos bancarios) como query params. Consistente con lo prometido en `/privacidad`.

## Recomendaciones de mantenimiento

1. **Dependabot o Renovate** en el repo de GitHub para PRs automáticos de security patches (esta auditoría encontró el Next vulnerable 5 versiones de patch atrás).
2. **`npm audit --omit=dev` en CI** con fallo en high/critical antes del deploy.
3. **`/.well-known/security.txt`** con contacto para reportes de vulnerabilidades, si el proyecto crece.
4. Nota no-seguridad: `userScalable: false` en el viewport perjudica accesibilidad (WCAG 1.4.4) — considerar quitarlo.

---

## Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `package.json` / `package-lock.json` | `next` y `eslint-config-next` → `^16.2.9`; lockfile sin vulnerabilidades |
| `next.config.mjs` | Security headers (CSP, HSTS, etc.) + `poweredByHeader: false` |
| `lib/validate.ts` | **Nuevo** — validación de IDs compartida |
| `lib/standalone.ts` | Cookie con `Secure` en HTTPS |
| `app/api/banks/route.ts` | Columnas explícitas |
| `app/api/promotions/[merchantId]/route.ts` | Columnas explícitas + validación de `merchantId` |
| `app/api/cards/route.ts` | Validación de `bankId` |
| `app/api/merchants/route.ts` | Validación de `category` |
| `app/api/merchants/[merchantId]/route.ts` | Validación de `merchantId` |
| `app/api/recommendations/route.ts` | Validación por ítem de `cardIds` + `merchantId` |

**Verificación:** `next build` ✓ (compila, typecheck OK, landing sigue estática) · `eslint .` ✓ (0 errores) · headers confirmados en runtime con `curl` · input malformado → `400` confirmado en runtime · `npm audit` → 0 vulnerabilidades.
