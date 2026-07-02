# ARCHITECTURE_DECISION.md — Split de OptiWallet en dos repos

**Estado:** Aprobado para ejecución (Fase 3)
**Fecha:** 2026-07-01
**Autor:** Revisión de arquitectura (reconciliación de `MONOREPO_SPLIT_MAP.md` + `implementation_plan.md`)
**Contexto general:** Se separa la app Next.js 16 única en dos repos/despliegues independientes:
- **`Optiwallet`** — PWA pública end-user + marketing + APIs de lectura.
- **`Optiwallet-admin`** — Panel privado, APIs de escritura CRUD + ops + pipeline de scraping.

Ambos repos apuntan al **mismo Neon** (una sola DB compartida). El admin vive en un **dominio separado** (`admin.optiwallet.cl`).

Este documento resuelve las cuatro discrepancias entre los dos análisis previos, fija la estrategia por archivo/módulo, define el orden de ejecución de la Fase 3 y responde en firme las Open Questions.

---

## Parte 1 — Decisiones (formato ADR)

### ADR-001 — `lib/format.ts`: inlinar `toISODateLocal`, no compartir el módulo

**Contexto.**
`MONOREPO_SPLIT_MAP.md` clasifica `format.ts` como **COMPARTIDO** (módulo completo). `implementation_plan.md` observa que el admin solo consume `toISODateLocal` y propone inlinarla. Verificación sobre el código: `format.ts` son 92 líneas, cero dependencias, funciones puras. El **único** consumidor admin es `app/api/admin/ops/reports/triage/` y usa **solo** `toISODateLocal` (3 líneas). El resto del módulo (`formatCLP`, `daysOfWeekLabel`, `modalityLabel`, `formatDiscount`, `formatDate`, nombres de días/meses en español) es presentación de la PWA pública y no tiene consumidor admin.

**Decisión.**
Se toma el enfoque de `implementation_plan.md`, refinado: **no** se arrastra `format.ts` al repo admin. Se crea en el admin un archivo mínimo `lib/date.ts` con **solo** `toISODateLocal` (incluyendo su comentario sobre la zona horaria de Chile, que es la razón de su existencia). Es "inlinar la función, no el módulo" — pero en su propio archivo, para que sea testeable y no una copia perdida en el call site.

**Justificación.**
Copiar 92 líneas de las cuales 89 son código muerto en el admin es peor que copiar 3. El grueso de `format.ts` codifica el lenguaje de presentación del usuario final (CLP, etiquetas en español), que no debe existir en un panel interno. Menos superficie = menos drift.

**Consecuencias.**
- El admin gana un `lib/date.ts` propio + su test unitario trivial.
- `format.ts` queda como módulo **exclusivo del repo público**, sin marca de "compartido".
- Si a futuro el admin necesitara más helpers de formato, se copian puntualmente; no se re-adopta el módulo entero.

---

### ADR-002 — DB compartida (mismo Neon, mismo modelo de dominio)

**Contexto.**
`implementation_plan.md` asume DB compartida sin justificarlo. `MONOREPO_SPLIT_MAP.md` (§5.1) señala que separar DBs rompe `app_settings` (maintenance mode). El trade-off real es más grande que ese flag: verificado en el inventario, el admin **escribe** y el público **lee** todo el modelo de dominio (`banks`, `cards`, `merchants`, `merchant_categories`, `merchant_tags`, `merchant_tag_map`, `promotions`, `promotion_codes`, `promo_reports`) además de `app_settings`. El propósito entero del admin es curar las promociones que la PWA sirve.

**Decisión.**
**DB compartida.** Un solo Neon; cada repo con su propio `DATABASE_URL` (o el mismo string) apuntando a la misma instancia. No se separan bases de datos.

**Justificación.**
`app_settings`/maintenance es solo la punta: separar DBs obligaría a sincronizar **todo el dataset de dominio** entre admin y público (ETL continuo, o que cada CRUD del admin escriba vía HTTP a la DB pública). Eso es complejidad de sistemas distribuidos injustificable para un proyecto de dos personas cuyo flujo natural es "admin escribe fila → público la lee". La DB **es** el contrato compartido entre ambos productos; separarla rompería el producto, no solo el maintenance mode.

**Mecanismo exacto del flag de maintenance entre repos separados (con DB compartida):**
No requiere **ninguna** llamada cross-repo. La tabla es el canal.
1. **Admin escribe.** El admin conserva `setMaintenanceMode(enabled, updatedBy)` y `getMaintenanceStatus()` (ver ADR-005). `setMaintenanceMode` hace `INSERT INTO app_settings (key,value,updated_by) VALUES ('maintenance_mode', 'true'|'false', ...) ON CONFLICT (key) DO UPDATE ...` sobre el Neon compartido, disparado desde el toggle de `/admin` (`POST /api/admin/maintenance`).
2. **Público lee.** El repo público conserva `isMaintenanceMode()` — `SELECT value FROM app_settings WHERE key='maintenance_mode'`, con cache in-memory de 30 s y *fail-open* (si la DB no responde, `false`, no bloquea a nadie). Lo invoca su `proxy.ts` en cada request pública.
3. **Propagación.** El TTL de 30 s del cache público es la latencia máxima entre que el admin activa el flag y que los usuarios ven `/mantencion`. Ya es el comportamiento actual; no cambia.

En otras palabras: **misma fila, misma DB, cero acoplamiento de código.** La escritura vive en un repo, la lectura en el otro, y coinciden solo en el nombre de tabla + convención de clave/valor (`'maintenance_mode'` → `'true'`/`'false'`).

**Consecuencias.**
- El schema de dominio + tablas compartidas (incl. `app_settings`) vive en el repo público como fuente de verdad (ver ADR-006).
- `lib/maintenance.ts` se parte (ADR-005), no se comparte como módulo.
- Costo aceptado: una migración sobre una tabla compartida impulsada por necesidades del admin debe aplicarse desde el repo público. Documentado como regla operativa; trivial a escala de 2 personas.
- El rate-limiter in-memory sigue no-distribuido (ya lo era); el split no lo empeora.

---

### ADR-003 — Design tokens CSS: duplicar, no extraer paquete

**Contexto.**
`MONOREPO_SPLIT_MAP.md` (§5.4) señala que `app/admin/admin.css` (989 líneas) reutiliza custom properties (`--bg`, `--bg-2`, `--ink`, `--ink-dim`, `--lime`, `--font-serif`, …) definidas en `globals.css`, sin importarlas. `implementation_plan.md` no lo cubre. Verificación: confirmado — `admin.css` usa `var(--bg/--ink/--lime/--font-serif/…)` y esas variables se definen en `globals.css` dentro de un bloque `@theme { … }` (tokens `--color-*`) más un `:root { --bg: var(--color-bg); … }` que las aliasea. Además `--font-serif` resuelve a `--font-fraunces`, que **lo inyecta `next/font` en el root layout**, no el CSS.

**Decisión.**
**Duplicar** el set de tokens dentro de `Optiwallet-admin`. Se crea `app/admin-tokens.css` (o se integra el bloque en el `globals.css` del repo admin) con **solo** los tokens que `admin.css` consume, copiados de `globals.css`. Se importa en el root layout del admin **antes** de `admin.css`. **No** se crea paquete npm de design tokens.

**Justificación (mantenibilidad vs. velocidad, proyecto de 2 personas).**
Un paquete `@optiwallet/tokens` implica registry privado, versionado, bumps y coordinación de instalación para ~30 líneas de custom properties estables. El overhead de mantenimiento supera con creces el de una copia. El riesgo señalado (drift visual) es real pero es una **decisión de producto**: el admin es una herramienta interna para 2 personas; la paridad de marca pixel-perfect con el sitio público no es requisito. Coincide con la propia recomendación de `MONOREPO_SPLIT_MAP.md` §5.5 para utilidades ("duplicar primero, extraer paquete solo si divergen").

**Gotcha a resolver en el layout del admin (no basta con copiar el CSS):**
`--font-serif` depende de `--font-fraunces`, que hoy lo provee `next/font` en el root layout único. El admin necesita **su propio root layout** (ADR-007) que: (a) cargue Fraunces vía `next/font` y exponga la variable CSS —recomendado, para que los headings del panel se vean igual—, **o** (b) simplemente acepte el fallback `Georgia, serif` que ya está escrito en `admin.css` (línea `font-family: var(--font-serif), Georgia, serif`). Para un panel interno, (a) es una línea y se recomienda; (b) es aceptable si se quiere cero dependencia de fuentes.

**Consecuencias.**
- El admin gana un archivo de tokens propio + carga de fuente propia.
- Si a futuro emerge un design system real con más superficies, se reevalúa extraer paquete (revisión, no ahora).
- Reevaluar solo si el palette de marca empieza a cambiar seguido y la divergencia molesta.

---

### ADR-004 — Dominio separado (`admin.optiwallet.cl`), coherente con el split del proxy

**Contexto.**
`implementation_plan.md` (Open Questions) recomienda dominio separado. `MONOREPO_SPLIT_MAP.md` (§5.2) señala que `proxy.ts` hoy mezcla tres responsabilidades y que el punto de fricción real es que el maintenance mode debe seguir controlable desde el admin y respetado por el público. Verificación del `proxy.ts` actual: hace (a) redirect a `/mantencion` (público, exime `/admin` y `/api/admin`), (b) guard de sesión admin vía `getAdminFromRequest` de `lib/admin-session`, (c) redirect PWA standalone (`/` → `/app`).

**Decisión.**
**Dominio separado: `admin.optiwallet.cl`.** Se descarta mantener el admin bajo `/admin` del mismo dominio.

**Justificación — validación de coherencia con §5.2.**
El dominio separado no solo es coherente: es lo que **habilita el corte limpio del proxy**. Con dos dominios, `proxy.ts` se parte en dos middlewares sin responsabilidades cruzadas:
- **Proxy público (`Optiwallet`):** conserva (a) maintenance redirect + (c) PWA standalone redirect. **Elimina** el guard admin (parte b) y las exenciones `/admin`/`/api/admin` — esas rutas ya no existen en este repo. Deja de importar `admin-session`. Resultado: `lib/admin-session.ts` **deja de ser compartido** y se va limpio al repo admin, resolviendo la fricción que ambos docs marcaban con ⚠️.
- **Proxy admin (`Optiwallet-admin`):** conserva **solo** el guard de sesión (`getAdminFromRequest`, redirect a `/admin/login`, forzar TOTP setup). No necesita maintenance redirect (el admin debe seguir arriba durante el mantenimiento — de hecho el proxy actual ya exime `/admin`). No necesita PWA redirect.
- **Maintenance cross-repo:** resuelto por ADR-002 vía DB compartida, **sin** llamada cross-domain. Totalmente coherente.

La alternativa (mismo dominio, admin bajo `/admin`) exigiría rewrites/proxying en Vercel enrutando `/admin/*` a un despliegue y el resto a otro: reintroduce una capa de ruteo compartida y el acoplamiento que el split busca eliminar. Por eso el dominio separado es la precondición del proxy limpio, no un detalle cosmético.

**Consecuencias.**
- Dos `proxy.ts` independientes, cada uno con su matcher; ninguno importa código del otro lado.
- La cookie `ow_admin_session` queda scopeada a `admin.optiwallet.cl` — mejor aislamiento, sin cambios de lógica.
- **§5.6 (dashboard admin llama a `/api/stats` público):** con dominios separados esa URL relativa se rompe. **Se reimplementa `stats` en el admin** con una query directa a la DB compartida (el admin ya tiene acceso a Neon), en vez de un `fetch` cross-origin (evita CORS y una dependencia de disponibilidad del sitio público). Es una query de agregación pequeña.
- CSP, `manifest.json` y `sw.js` quedan 100% en el público; su código que exime `/admin` se vuelve muerto y se borra.

---

### ADR-005 — `lib/maintenance.ts` se parte en mitad-lectura (público) y mitad-escritura (admin)

**Contexto.**
Módulo `server-only` con tres funciones: `isMaintenanceMode()` (lectura cacheada, la usa el proxy público), `setMaintenanceMode()` (escritura, la usa el toggle admin) y `getMaintenanceStatus()` (lectura del registro completo para la UI admin).

**Decisión.**
No se comparte como módulo. Se **divide por consumidor**:
- Repo **público** → `isMaintenanceMode()` (con su cache de 30 s y fail-open).
- Repo **admin** → `setMaintenanceMode()` + `getMaintenanceStatus()`.

**Justificación.**
Cada mitad tiene un único lado consumidor. Compartir el módulo entero arrastraría escritura al público y lectura-cacheada al admin, ambas muertas en su lado. La coordinación necesaria es solo la convención de clave/valor de `app_settings`, ya fijada en ADR-002.

**Consecuencias.**
- Ambas mitades hablan con la misma tabla del mismo Neon; funcionan sin código común.
- Único invariante a mantener a mano: la clave `'maintenance_mode'` y los valores `'true'`/`'false'`. Documentar como comentario en ambos archivos.

---

### ADR-006 — Propiedad del schema: público es dueño del dominio; admin lleva su schema-admin

**Contexto.**
`scripts/schema.sql` hoy contiene DDL de todas las tablas (dominio + admin + staging + settings). Con DB compartida (ADR-002) hay que decidir quién "posee" las migraciones.

**Decisión.**
- Repo **público**: dueño de `schema.sql` (tablas de dominio + compartidas, incl. `app_settings`, `promo_reports`, `promotions`, `promotion_codes`, `promo_events`) y de los scripts `db:schema`/`db:seed`/`db:gen-seed`/`db:migrate-tags`, además de los jobs de datos (`popularity:compute`, `promotions:refresh`).
- Repo **admin**: lleva un `schema-admin.sql` con **solo** sus tablas exclusivas: `admin_users`, `admin_login_attempts`, `admin_audit_log`, `scraper_runs`, `promo_staging`, `scraper_raw_cache`. Más los scripts de bootstrap admin (`admin:create`, `admin:encrypt-totp`).

**Justificación.**
El modelo de dominio es el modelo del producto público; los scripts de seed/migración de dominio ya viven conceptualmente ahí. El admin solo necesita autonomía sobre sus propias tablas operativas. Un tercer repo de infraestructura para el schema es overkill a escala de 2 personas.

**Consecuencias.**
- Regla operativa: cualquier `ALTER TABLE` sobre una tabla compartida se hace desde el repo público (siguiendo el patrón idempotente `ADD COLUMN IF NOT EXISTS` ya usado en el proyecto), incluso si lo motiva una feature del admin. Coordinación mínima, aceptada.
- Ambos `schema-*.sql` son idempotentes y se pueden aplicar en cualquier orden sobre el mismo Neon.

---

### ADR-007 — Root layout, `sentry.ts`, y utilidades puras

**Contexto.**
El root layout único sirve ambos lados y monta componentes PWA neutralizados en `/admin` por checks de string. `sentry.ts` y `analytics.ts` filtran `/admin` en runtime. `db.ts`, `validate.ts`, `rate-limit.ts` son utilidades usadas por ambos.

**Decisión.**
- **Root layout:** cada repo tiene el suyo. El admin escribe un layout propio (`<html>/<body>`, su fuente, `admin-tokens.css` + `admin.css`) **sin** `ServiceWorkerRegistrar`, `StandaloneCookieSync`, `OfflineBanner`. Los checks `pathname.startsWith("/admin")` en `analytics.ts` y `sentry.ts` se vuelven código muerto y se borran en cada copia.
- **`sentry.ts`:** se duplica; cada repo con su propio DSN (ver Q3). El filtro `/admin` desaparece.
- **`db.ts`, `validate.ts`, `rate-limit.ts`:** se **duplican** (funciones pequeñas, puras/estables). El admin internaliza `clientIp` directamente en `admin-guard` (hoy re-exportado desde `rate-limit`).

**Justificación.**
Son <300 LOC combinadas, estables y sin efectos que causen drift peligroso. Un paquete `@optiwallet/shared` no se justifica a esta escala; se reevalúa solo si empiezan a divergir (mismo criterio que ADR-003).

**Consecuencias.**
- Cero dependencia de build entre repos.
- Si `validate.ts`/`db.ts` divergen mucho en el futuro, reconsiderar un paquete compartido.

---

## Parte 2 — Estrategia final por archivo/módulo compartido

Leyenda: **Duplicar** (copia independiente en ambos) · **Inlinar** (copiar solo la función usada) · **Partir** (dividir por consumidor) · **Vive en un repo** (se mueve entero) · **Extraer paquete** (no se usa).

| Archivo / módulo | Clasificación previa en conflicto | Estrategia final | Repo(s) | ADR |
|---|---|---|---|---|
| `lib/db.ts` | Compartido (ambos docs) | **Duplicar** | Ambos | ADR-007 |
| `lib/validate.ts` | Compartido (ambos docs) | **Duplicar** | Ambos | ADR-007 |
| `lib/rate-limit.ts` | Compartido | **Duplicar** (admin internaliza `clientIp` en `admin-guard`) | Ambos | ADR-007 |
| `lib/format.ts` | Split-map: compartido / Plan: inline | **Inlinar** `toISODateLocal` → `lib/date.ts` en admin; módulo queda público | Público (módulo) + admin (3 líneas) | ADR-001 |
| `lib/maintenance.ts` | Compartido (split-map) | **Partir**: `isMaintenanceMode`→público; `setMaintenanceMode`+`getMaintenanceStatus`→admin | Ambos (mitades) | ADR-005 |
| `lib/sentry.ts` | Compartido (split-map) | **Duplicar**, DSN propio, borrar filtro `/admin` | Ambos | ADR-007, Q3 |
| `app_settings` (tabla) | Compartida | **DB compartida**, misma fila | Neon único | ADR-002 |
| `scripts/schema.sql` | Compartido | **Vive en público** (dueño); admin lleva `schema-admin.sql` | Público + subset admin | ADR-006 |
| `proxy.ts` | Fricción (3 responsabilidades) | **Partir** en dos middlewares independientes | Ambos | ADR-004 |
| `app/layout.tsx` (root) | Fricción (sirve ambos) | **Vive en cada repo** (admin escribe el suyo, sin PWA) | Ambos | ADR-007 |
| Design tokens (`--bg`,`--ink`,`--lime`,`--font-serif`…) | Solo split-map (§5.4) | **Duplicar** en `admin-tokens.css`; cargar Fraunces en layout admin | Ambos | ADR-003 |
| `lib/admin-*.ts` (auth, crypto, guard, log, session, types) | Admin-only (ambos) | **Vive en admin** | Admin | — |
| `lib/staging.ts`, `lib/ops/fetch-bank.ts` | Admin-only | **Vive en admin** | Admin | — |
| `lib/ai/*` (provider, merchant-suggest, report-triage) | Admin-only | **Vive en admin** | Admin | — |
| `lib/hooks/use-modal-keyboard.ts` | Compartido "de nombre" / admin-only real | **Vive en admin** (único consumidor: modales admin) | Admin | — |
| `lib/{analytics,api-client,constants,recommendations,use-wallet,openapi,standalone}.ts` + `lib/hooks/{use-api,use-today,use-online-status,use-service-worker}.ts` | Público-only | **Vive en público** | Público | — |
| `app/admin/**`, `app/api/admin/**`, `app/admin/components/**` | Admin-only | **Vive en admin** | Admin | — |
| `components/**` (raíz), `app/app/**`, páginas marketing, `app/api/**` público, `app/api-docs` | Público-only | **Vive en público** | Público | — |
| `scripts/scrapers/**` | Admin (ambos) | **Vive en admin** | Admin | Q1 |
| `scripts/{seed,gen-seed,migrate-categories-to-tags,compute-merchant-popularity,refresh-promos}.ts` | Compartido/datos | **Vive en público** (dueño de la DB de dominio) | Público | ADR-006 |
| `scripts/{create-admin,encrypt-totp,test-login-flow}.ts` | Admin | **Vive en admin** | Admin | — |
| `/api/stats` (consumido por dashboard admin) | Fricción §5.6 | **Reimplementar** query en admin (sin fetch cross-origin) | Ambos (endpoint público sigue; admin query propia) | ADR-004 |
| `docs/API.md` | Público | **Vive en público** | Público | — |
| `docs/{ADMIN,SCRAPING}.md` | Admin | **Vive en admin** | Admin | — |
| `docs/{ARCHITECTURE,SECURITY}.md` | Interlazados | **Reescribir** partiéndolos | Ambos | — |
| `public/{sw.js,manifest.json}` | Público | **Vive en público**; borrar código muerto `/admin` | Público | — |
| `vercel.json`, `tsconfig.json`, `next.config.mjs` | Genéricos | **Duplicar** (triviales) | Ambos | — |

---

## Parte 3 — Orden de ejecución recomendado (Fase 3)

Precondición: las decisiones de arquitectura (esta ADR) están aprobadas. El orden minimiza ventanas rotas y deja el público funcionando en todo momento.

1. **Fijar la DB compartida (ADR-002) — antes de tocar código.** Confirmar que ambos entornos (público existente + nuevo proyecto Vercel admin) usan el mismo `DATABASE_URL`. No se migra ni se separa nada de datos. Todo lo demás depende de esta base.

2. **Crear el repo `Optiwallet-admin` vacío + scaffold Next.js 16.** `package.json` con dependencias admin (`@neondatabase/serverless`, `next`, `react`, `react-dom`, `server-only`, `bcryptjs`, `otpauth`, `qrcode`, `tailwindcss`+`postcss` dev). Duplicar `tsconfig.json`, `vercel.json` (region `gru1`), `next.config.mjs` base.

3. **Mover los directorios "limpios" al admin (>80% del código, sin fricción):**
   `app/admin/**`, `app/api/admin/**`, `app/admin/components/**`, `lib/admin-*.ts`, `lib/staging.ts`, `lib/ops/fetch-bank.ts`, `lib/ai/**`, `lib/hooks/use-modal-keyboard.ts`, `scripts/scrapers/**`, `scripts/{create-admin,encrypt-totp,test-login-flow}.ts`, `docs/{ADMIN,SCRAPING}.md`, tests `admin-crypto.test.ts`.

4. **Duplicar/adaptar el núcleo en el admin (ADR-001, 005, 006, 007):**
   - `lib/db.ts`, `lib/validate.ts`, `lib/rate-limit.ts` (internalizar `clientIp` en `admin-guard`).
   - `lib/date.ts` con solo `toISODateLocal` (reemplaza el import de `format`).
   - Mitad de escritura de `maintenance.ts` (`setMaintenanceMode`, `getMaintenanceStatus`).
   - `schema-admin.sql` con las 6 tablas admin-only.
   - `sentry.ts` (DSN admin, sin filtro `/admin`).

5. **Escribir el root layout + tokens + fuentes del admin (ADR-003, 007):**
   layout propio con `<html>/<body>`, `next/font` (Fraunces), `admin-tokens.css` (tokens copiados) + `admin.css`, **sin** componentes PWA. Borrar checks `/admin` muertos en cualquier copia de `analytics`/`sentry`.

6. **Escribir el `proxy.ts` del admin (ADR-004):** solo guard de sesión (`getAdminFromRequest`, redirect login, forzar TOTP). Matcher `"/admin/:path*"` (o toda la app, ya que todo el repo es admin).

7. **Reimplementar `stats` en el admin (ADR-004 / §5.6):** query directa a Neon para el dashboard, eliminando el `fetch("/api/stats")` cross-origin.

8. **Desplegar el admin en `admin.optiwallet.cl` y validar de punta a punta** contra el Neon compartido: login+TOTP, un CRUD de cada tabla, un ciclo de ops (import→staging→approve), y el toggle de maintenance (verificar que el público lo respeta en ≤30 s).

9. **Recién entonces, limpiar el repo público `Optiwallet`:**
   - Borrar `app/admin/**`, `app/api/admin/**`, `app/admin/components/**`, `lib/admin-*`, `lib/staging`, `lib/ops`, `lib/ai`, `lib/hooks/use-modal-keyboard`, scripts y docs admin.
   - Simplificar `proxy.ts`: quitar el guard admin y el import de `admin-session`; dejar maintenance + PWA redirect.
   - Recortar `maintenance.ts` a solo `isMaintenanceMode`.
   - Borrar código muerto `/admin` en `analytics.ts`, `sentry.ts`, `sw.js`.
   - Quitar dependencias `bcryptjs`, `otpauth`, `qrcode` (+ `@types`).

10. **Reescribir `docs/ARCHITECTURE.md` y `docs/SECURITY.md`** partiéndolos por repo (manual, no `mv`). Actualizar los `CLAUDE.md` de cada repo.

11. **Verificación final (por repo):** `npm run lint`, `npm test`, `npm run build` en cada uno; smoke test del público (feed de recomendaciones, wallet, detalle de comercio, PWA install/standalone) y confirmación de que el admin no dejó imports colgando ni el público referencias a módulos borrados.

> El orden clave: **construir y validar el admin nuevo contra la DB compartida ANTES de borrar nada del público** (pasos 3–8 antes del 9). Así el público nunca queda roto y hay rollback trivial (no se ha tocado) si el admin falla.

---

## Parte 4 — Open Questions (respuestas firmes)

### Q1 — ¿Scrapers al admin o repo independiente? → **Al repo admin.**
`scripts/scrapers/**` corre localmente y sube JSON a `/admin/ops/import`; son parte integral del pipeline de staging/ops. Ambos análisis ya se inclinaban por el admin. Un tercer repo de scrapers solo agregaría coordinación (versionar el contrato con el admin, otro CI) sin beneficio a escala de 2 personas. Viven en `Optiwallet-admin/scripts/scrapers/`. Solo se justificaría separarlos si algún día corrieran como servicio autónomo con su propio despliegue — no es el caso hoy.

### Q2 — ¿Dominio separado para el admin? → **Sí: `admin.optiwallet.cl`.**
Resuelto en ADR-004. No solo es viable: es la precondición que permite partir `proxy.ts` limpio y sacar `admin-session` del repo público. La alternativa (mismo dominio bajo `/admin` con rewrites de Vercel) reintroduce ruteo compartido y anula parte del beneficio del split. Consecuencia menor ya cubierta: reimplementar `stats` en el admin en vez de `fetch` cross-origin.

### Q3 — ¿Sentry en el admin? → **Proyecto Sentry propio (DSN separado); puede lanzarse deshabilitado.**
Recomendación firme: el admin usa **su propio proyecto de Sentry con su propio DSN**, no el del público ni ninguno compartido. Razones: presupuestos de error y alertas separados; los errores del admin son operacionalmente distintos (bloquean la operación de contenido, no a usuarios finales) y merecen triage propio. Como `sentry.ts` se autodesactiva sin DSN, es válido **desplegar el admin al inicio sin DSN** (Sentry off) y cablearlo después — pero la decisión arquitectónica es proyecto separado, no DSN compartido. En ambas copias se elimina el filtro runtime `/admin`, que queda muerto.

---

## Resumen ejecutivo de cambios frente a los docs de entrada

- **`format.ts`:** gana `implementation_plan` (inlinar), refinado a un `lib/date.ts` propio en admin. `MONOREPO_SPLIT_MAP` sobre-clasificó como módulo compartido.
- **DB:** se **valida** la DB compartida de `implementation_plan`, pero con la justificación que faltaba: no es por `app_settings`, es porque **todo el modelo de dominio** es el contrato compartido. Mecanismo del flag: misma fila de `app_settings`, cero código común (ADR-002/005).
- **Design tokens:** se resuelve el gap de `implementation_plan` (no lo cubría): **duplicar** tokens + cargar Fraunces en el layout admin. No paquete.
- **Dominio separado:** **coherente y necesario** para el corte limpio del proxy (§5.2); valida `implementation_plan` y resuelve la fricción de `MONOREPO_SPLIT_MAP`.
- **Open Questions:** scrapers→admin, dominio→separado, Sentry→proyecto propio (lanzable off).
