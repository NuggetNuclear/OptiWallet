# Estado de la documentación — OptiWallet

> Generado: 2026-06-30 · v1.0.0-beta.2
> Auditoría completa de toda la documentación del repo contra el código real, más estandarización de versión. Ver el commit de esta fecha para el diff completo.

Este documento es un snapshot de la auditoría — no se mantiene activamente como el resto de `docs/`. Sirve como registro de qué se revisó, qué estaba desactualizado, y qué quedó pendiente.

---

## 1. Versionado

Antes de esta auditoría, `1.0.0-beta.1` estaba ya consistente en todos los archivos (no había drift de versión), pero no reflejaba el trabajo shippeado desde su fijación: central de operaciones de scraping, ranking por popularidad, analítica de eventos (`promo_events`), resolver de comercios asistido por IA, scrapers de Falabella y Santander.

**Se estandarizó a `1.0.0-beta.2`** en los 12 puntos donde vivía el string de versión:

`package.json`, `package-lock.json` (2 ocurrencias), `lib/sentry.ts` (release tag), `lib/openapi.ts` (spec version), `components/InnerPageLayout.tsx`, `app/app/page.tsx`, `app/page.tsx`, `app/api-docs/page.tsx`, `README.md` (2 ocurrencias), los 4 headers de `docs/*.md` (API/ARCHITECTURE/ADMIN/SECURITY).

`docs/SCRAPING.md` no tenía header de versión — se le agregó uno para igualar la convención del resto de `docs/*.md`.

**Próximo bump:** sugerido `1.0.0-beta.3` cuando se cierre la fase 3 del ranking de popularidad (ver §3 abajo) o cuando se publique contenido real para las páginas "Coming Soon" (`TODO.md`).

---

## 2. Qué se auditó y el resultado por documento

| Documento | Estado encontrado | Cambios |
|---|---|---|
| `docs/API.md` | Desactualizado | Faltaba `POST /api/promo-events` completo (endpoint nuevo, no documentado). El conteo "8 endpoints" → 9. `/api/recommendations` describía `ORDER BY discount DESC`, que ya no es la query real (ver §3). Faltaban funciones de re-ranking client-side y el campo `max_discount` en `/api/merchants`. Ejemplos JSON incompletos vs. las tablas de campos. |
| `docs/ARCHITECTURE.md` | Desactualizado, hallazgo mayor | La sección de ranking por popularidad decía "en desarrollo" / pendiente la query consumidora y la tabla `promo_events` — **ambas ya están implementadas**. Faltaban `promotion_codes` y `promo_events` en el diagrama de schema. Nombres de cache del SW documentados como literal `optiwallet-v2` cuando en realidad son `optiwallet-${SW_VERSION}` (commit SHA, vía `scripts/stamp-sw-version.ts`). Faltaba documentar que el SW v3 ya no intercepta `/admin` ni `/api/admin`. |
| `docs/ADMIN.md` | Muy desactualizado | La "Central de operaciones" completa (`/admin/ops/**`) — fetch/import de scrapers, cola de revisión de staging, aprobación/rechazo individual y masivo, autofill por IA, sugerencia de comercio por IA, consola streaming SSE — **no existía en el documento**. Tampoco el log de auditoría (`/admin/audit`), el toggle de modo mantenimiento (vive en `/admin/ops`, no en el dashboard, y pide TOTP en cada cambio), el borrado masivo de promociones (también TOTP-gated), ni el flag `is_root`. El schema de `promotions`/`cards` documentado estaba desactualizado (faltaban `discount_per_unit`/`discount_unit`, `stackable`, `card_ids`, tipo `prepaid`, `color` en bancos). El doc creció de 879 a >1000 líneas. |
| `docs/SECURITY.md` | **Sin cambios necesarios** | Se verificó CSP (`next.config.mjs`), parametrización SQL (grep completo de `app/api/**`), validación de IDs, manejo de secrets y postura de rate limiting contra el código real — todo coincide exactamente con lo documentado. |
| `docs/SCRAPING.md` + `scripts/scrapers/SCRAPER-SPEC.md` | Muy desactualizado, hallazgo mayor | Describían un mundo ficticio de scrapers `.mjs`/Node. En realidad Itaú y BCI son **Python** (`scraper_itau.py`, `bci_beneficios.py`, este último vía Playwright). **Dos bancos enteros no estaban documentados**: `banco_falabella.py` y `banco_santander.py` (ambos sembrados en la DB y funcionales). Enlaces rotos a un archivo inexistente (`BANCO-CHILE-FINDINGS.md` → el real es `doc-scraperBChile.md`). El spec de importador tenía dos afirmaciones falsas sobre comportamiento real (ver §4). |
| `tests/README.md` | Casi al día | La lista de archivos de test ya estaba completa y correcta. Dos conteos de tests desactualizados (`api-client.ts` 22→24, `standalone.ts` 13→14). Metodología de aislamiento verificada contra 3 archivos de test — correcta. `npm test`: **270/270 passing**. |
| `README.md` | Desactualizado en varios puntos | Tabla de documentación no listaba `docs/ADMIN.md`, `docs/SCRAPING.md` ni `tests/README.md`. Tabla de env vars no tenía las variables de IA, Sentry sourcemaps, ni las del panel admin. Tabla de scripts faltaban `db:gen-seed`, `promotions:refresh`, `admin:create`, `admin:encrypt-totp`, `test:coverage`. Árbol de estructura con conteos de endpoints viejos y sin `promo-events/route.ts`. Tabla de tablas de DB sin `promotion_codes`, `promo_events`, `scraper_raw_cache`. Nombres de cache del SW hardcodeados igual que en ARCHITECTURE.md. |
| `CLAUDE.md` | Desactualizado | Faltaba toda la sección de la abstracción de IA (`lib/ai/provider.ts`) — ni mencionada. Tabla de env vars sin las variables de IA ni las de Sentry sourcemaps. Lista de comandos sin `db:gen-seed`, `promotions:refresh`, `swagger:update`. Sección de motor de recomendaciones no mencionaba el score compuesto server-side (solo el re-ranking client-side). |
| `TODO.md` | Un ítem con drift importante | El ítem de "Ranking de promos por popularidad" describía como pendiente trabajo que **ya está shippeado** (la query consumidora del score compuesto, y la tabla+endpoint de `promo_events`). Corregido para reflejar que solo falta la fase 3 (diluir `popularity_prior` con tráfico real de `promo_events`). |
| `lib/openapi.ts` (spec servida en `/api/openapi.json` y Swagger UI) | Desactualizado | Mismo gap que `docs/API.md`: no incluía `POST /api/promo-events`. Corregido directamente (no es solo doc — es código que sirve el spec real a usuarios de la API). |

---

## 3. El hallazgo más importante: el ranking de popularidad ya está más avanzado de lo que decía la documentación

Tanto `docs/ARCHITECTURE.md` como `TODO.md` describían el ranking de `/api/recommendations` como `ORDER BY discount DESC` con la query de popularidad "pendiente". Eso era cierto cuando se escribió, pero el código actual (`app/api/recommendations/route.ts`) ya implementa un **score compuesto** ponderado:

- 50% descuento
- 20% `popularity_prior` (prior frío de Google Places)
- 20% frescura (decay exponencial sobre `verified_at`)
- 10% urgencia (vencimiento ≤ 7 días)

Y la tabla `promo_events` + el endpoint `POST /api/promo-events` (registro anónimo de vistas/taps) **también ya existen y están en producción** (`app/api/promo-events/route.ts`).

**Lo único que sigue pendiente** (confirmado con grep: `promo_events` solo aparece en el endpoint de escritura y en `lib/api-client.ts`, en ningún consumidor): nada lee todavía `promo_events` para diluir el `popularity_prior` estático con tráfico real vía el promedio bayesiano descrito en el diseño original. Esa es la única pieza honestamente pendiente — todo lo demás del plan de 3 fases está hecho.

---

## 4. Bugs/gaps de código encontrados durante la auditoría (documentados, no corregidos)

La tarea era documentación, así que estos se señalan para que se decida si ameritan un fix — no se tocó código de scraping sin poder probarlo contra los sitios reales:

1. **`scripts/scrapers/banco_santander.py` emite `_source_tags` en vez de `_source_cards`.** Es el único scraper que no sigue el contrato (`lib/staging.ts:140` lee `r._source_cards ?? []`), así que las promos de Santander en staging siempre llegan con `source_cards` vacío. No es un bug de datos (no afecta `card_types`/`card_ids`, que se resuelven aparte) — solo pierde el hint de referencia cruda que ven los revisores humanos. Fix de una línea si se quiere corregir.
2. **`app/api/admin/ops/import/route.ts` hardcodea `rejectedNames: []`.** El spec (`SCRAPER-SPEC.md`) afirmaba que el importer descarta filas con `merchant_name` > 40 caracteres y las reporta ahí — eso no está implementado; el límite de 40 caracteres solo se aplica después, en el paso de aprobación (`staging/[id]/approve`). El spec ya se corrigió para reflejar el comportamiento real.

---

## 5. Metodología

Se lanzaron 6 agentes en paralelo, cada uno responsable de un documento (o grupo de documentos relacionados), con instrucciones de leer el documento completo, verificar cada afirmación contra el código fuente real (no contra el documento mismo ni contra otra documentación), y corregir directamente con `Edit`. README.md y CLAUDE.md se auditaron y corrigieron directamente en la sesión principal por ser los documentos más "centrales" (referenciados por todos los demás). El versionado se aplicó de forma centralizada al inicio para evitar que cada agente tuviera que coordinarlo por separado.

Verificación final: `npm test` (270/270 passing), `npm run lint` (0 errores), `npx tsc --noEmit` (sin errores en `lib/openapi.ts` tras los cambios).

---

## 6. Recomendaciones de seguimiento

- Decidir si vale la pena el fix de una línea en `banco_santander.py` (§4.1).
- Si se prioriza la fase 3 del ranking de popularidad (§3), el diseño bayesiano ya está documentado en `docs/ARCHITECTURE.md` — falta solo la implementación.
- Mantener la disciplina de "si agregas/cambias un endpoint, actualiza `docs/API.md` **y** `lib/openapi.ts`" (ya señalada en el header del propio `lib/openapi.ts`) — fue la causa raíz de que `/api/promo-events` quedara sin documentar en ambos lados por el mismo tiempo.
- Los 4 docs largos (`ADMIN.md`, `ARCHITECTURE.md`, `API.md`, `SCRAPING.md`) tienden a quedar atrás de features nuevas en el panel admin específicamente — vale la pena revisarlos en cada sprint que toque `app/admin/**` o `app/api/admin/**`, no solo al final.
