# TODO — Placeholders y pendientes

> Inventario de todo el contenido placeholder y las tareas operativas pendientes.
> Generado en Sprint 2 (junio 2026). Marcar con `[x]` al resolver.

## 🔴 Contenido placeholder visible en producción

### Landing (`app/page.tsx`)
- [x] **Testimonio falso** — sección quote: ahora dice "Beta tester" con "Nombre real próximamente" en vez de placeholder genérico. Reemplazar con datos reales cuando estén disponibles.
- [ ] **Avatar del testimonio** — `.quote-avatar` es un círculo vacío sin foto.
- [ ] **Cifra "$180k de ahorro promedio anual"** — proyección sin metodología real (el footer admite "*Estimaciones con placeholder"). Calcular con datos reales o re-redactar.
- [ ] **Cifra "+40% de los chilenos tiene más de 2 tarjetas"** — sin fuente citada. Buscar fuente (CMF/SBIF) o eliminar.
- [ ] **Cifra "14 bancos al lanzamiento"** — hardcodeada; el resto de stats viene de `/api/stats`. Unificar o verificar.
- [x] **Footer: "v1.0.0-beta.1 · \*Estimaciones con placeholder"** — eliminado el asterisco y texto placeholder. Ahora dice solo el número de versión vigente (ver `package.json`).
- [x] **Sección "Instalar" (#instalar)** — instrucciones actualizadas: ahora dice "tu navegador" en vez de "Safari", con aclaración "Safari en iPhone, Chrome en Android".

### Páginas "Coming Soon" (componente `ComingSoon`)
- [ ] **/sobre-nosotros** — solo un párrafo genérico ("equipo de estudiantes de la UDP"). Escribir la historia real, fotos/nombres del equipo.
- [ ] **/blog** — sin artículos. Escribir los primeros posts (ideas: guía promos por banco, cómo funciona el motor de recomendaciones).
- [x] **/roadmap** — publicado roadmap real (Lanzado / En progreso / Próximamente) en `app/roadmap/page.tsx`. Mantener sincronizado con este archivo al cerrar items.
- [ ] **/prensa** — "Kit de prensa en preparación". Crear kit: logos (SVG/PNG), capturas, ficha de datos, boilerplate.

### Email de contacto
- [ ] **hola@optiwallet.cl** — usado en contacto, prensa, privacidad y ComingSoon. Verificar que el dominio optiwallet.cl esté registrado y la casilla exista; si no, cambiar a una casilla real en todos los puntos (grep `hola@optiwallet.cl`).

## 🟡 Operativo Sprint 2 (para activar lo implementado)

- [x] **Sentry**: proyecto creado en sentry.io y `NEXT_PUBLIC_SENTRY_DSN` seteado en Vercel. SDK activo en producción desde 2026-06-13.
- [ ] **Sentry sourcemaps** (opcional): agregar `withSentryConfig` en `next.config.mjs` + `SENTRY_AUTH_TOKEN` para stack traces legibles en producción.
- [ ] **Plausible**: agregar el sitio en plausible.io y setear `NEXT_PUBLIC_PLAUSIBLE_SRC` (el `src` del snippet v2) en Vercel. Walkthrough de claves: [`docs/ADMIN.md`](docs/ADMIN.md#inventario-y-rotación-de-claves).
- [ ] **Plausible goals**: registrar los eventos custom como Goals para verlos en el dashboard: `Onboarding Started`, `Onboarding Completed`, `Wallet Updated`, `CTA Click`, `Install Modal Opened`, `Install Instructions Viewed`, `Merchant Viewed`.
- [x] **Dependencias limpiadas**: `vitest` y `tsx` eliminados — los tests corren con `node:test` (nativo) y los scripts de DB con `node` directo (TypeScript strip-types de Node ≥ 22). `npm install` ya no trae dependencias vulnerables (`esbuild`).
- [ ] **Google Places (ranking)**: habilitar "Places API (New)" en GCP, crear API key restringida y setear `GOOGLE_PLACES_API_KEY` en `.env.local`. Correr `npm run db:schema` (crea las columnas de popularidad) y luego `npm run popularity:compute -- --dry-run` para revisar antes de escribir.

## 🟠 Migración de datos pendiente (una vez en producción)

- [ ] **Categorías → macro + tags**: el modelo pasó de 31 categorías planas a ~8 categorías macro + un sistema de *tags* (las antiguas granulares). En una base EN VIVO hay que correr **una vez**: `npm run db:schema` (crea `merchant_tags` / `merchant_tag_map`) y luego `npm run db:migrate-tags` (crea las macro, convierte las antiguas categorías en tags, repunta cada comercio a su macro y etiqueta, y borra las categorías vacías). El script es idempotente. El mapeo macro↔antigua vive en `scripts/migrate-categories-to-tags.ts` y es ajustable por admins después desde el panel (Categorías / Etiquetas / Fusionar).

## 🟢 Deuda menor / mejoras

- [x] Banner de "nueva versión disponible" cuando el Service Worker detecta update — pill flotante glassmorphism con botón "Actualizar" y dismiss. Hook `useServiceWorker` ahora expone `updateAvailable`, `applyUpdate()` y `dismiss()`.
- [x] Swagger UI (`/api-docs`): los assets en `public/swagger/` ahora se actualizan con `npm run swagger:update` (script `scripts/update-swagger-ui.ts`). Versión actual: swagger-ui-dist@5.32.6.
- [ ] Favoritos + alertas e Historial de ahorro: marcados "Próximamente" en la landing — alinear con el roadmap publicado.
- [x] **Ranking de promos por popularidad — fases 1 y 2 hechas.** (1) Cold-start: `merchants.popularity_prior`/`merchant_tier` poblados por `npm run popularity:compute` desde Google Places. (2) Query consumidora: `/api/recommendations` ya ordena por un score compuesto (50% descuento + 20% popularidad + 20% frescura + 10% urgencia) en vez de `ORDER BY discount DESC`. (3) Tabla `promo_events` (vistas/taps) y endpoint `POST /api/promo-events` ya existen y loguean tráfico real. **Pendiente (fase 3):** nada todavía lee `promo_events` — el score sigue usando el `popularity_prior` estático de Google Places sin diluirlo con el promedio bayesiano de tráfico real. Diseño en [`docs/ARCHITECTURE.md` → Flujo de recomendaciones](docs/ARCHITECTURE.md).
- [x] Página 404 personalizada (`app/not-found.tsx`) — diseño premium con "404" outline, glows decorativos, stagger animations y CTAs branded.
- [x] **Bandeja de reportes de usuarios** (`/admin/ops/reports`): el 👎 en las recomendaciones ahora persiste en `promo_reports` (captura en dos fases, motivo opcional) en vez de solo disparar un evento de analítica. Admins triagean por promo (resolver/descartar/desactivar), con priorización heurística por defecto y opcional por IA (`lib/ai/report-triage.ts`). Ver [`docs/ADMIN.md`](docs/ADMIN.md#ops--bandeja-de-reportes-de-usuarios).
- [x] **Modelo de roles admin root / no-root**: crear, eliminar y modificar **otras** cuentas es exclusivo del admin raíz (`is_root`, el bootstrapeado por `admin:create`); cualquier admin sigue pudiendo gestionar su propia cuenta con step-up re-auth. Cada admin tiene además un `name` (nombre visible) obligatorio.
- [x] **Herramientas de administración de tags** completas: CRUD de `merchant_tags`, fusión (merge) de categorías y de tags (`POST .../[id]/merge`), y filtro público por tag (`?tags=` en `/api/merchants`, nuevo `GET /api/tags`). El pipeline de aprobación de scraping asigna tags automáticamente (nunca categorías nuevas). La migración de una base **en vivo** sigue pendiente — ver sección "Migración de datos pendiente" más arriba.
- [x] Fetch de Banco de Chile con progreso en vivo (SSE, `POST /api/admin/ops/fetch/stream`) en la misma consola tipo terminal (`TerminalConsole`) que "Auto-aprobar backlog", en vez de un spinner opaco.
- [x] **UI offline**: `OfflineBanner` avisa con un banner fijo apenas el navegador pierde conexión (`navigator.onLine` + eventos `online`/`offline` vía `useSyncExternalStore`, `lib/hooks/use-online-status.ts`). Antes el Service Worker servía la cache en silencio, sin indicador visual.
