# Scraping → staging → revisión → promociones

Central de operaciones para poblar `promotions` desde las páginas de beneficios
de cada banco, con revisión humana obligatoria antes de producción.

## Flujo end-to-end

```
1. FETCH      scripts/scrapers/<banco>.mjs   (local; el fetch pasa por navegador
              ↓ out/<banco>.import.json        por anti-bot — ver §Anti-bot)
2. IMPORT     /admin/ops/import  → sube el JSON
              ↓                     POST /api/admin/ops/import
3. STAGING    promo_staging (status=pending) + scraper_runs (tracking del fetch)
              ↓
4. REVISIÓN   /admin/ops/<bankId>  → resolver/crear comercio, verificar campos
              ↓                       POST …/staging/<id>/approve | /reject
5. PRODUCCIÓN promotions (active=true, verified_at=hoy)
```

Nada entra a `promotions` sin que un admin lo apruebe. Protege un dato que afecta
plata del usuario de errores de parseo y de alucinaciones de cualquier LLM futuro.

## Central de operaciones (`/admin/ops`)

Página principal = backlog y estado por banco:

- **Promos por revisar** (total pendiente en staging) — el backlog global.
- **Bancos sin fetch** y **último fetch** por banco (desde `scraper_runs`).
- **En producción**: promos activas por banco.
- **Casos borde** del último fetch (informativo; no se importan).

Cada banco tiene su sub-dashboard `/admin/ops/<bankId>` con la cola de revisión
(pestañas pendientes / aprobadas / rechazadas).

## Revisión (resolver comercio + verificar)

Por cada fila pendiente el revisor:

1. **Resuelve el comercio** — mapea a uno existente o crea uno nuevo en el acto
   (id, nombre, categoría). La **caja de sugerencias** usa IA: rankea los
   comercios existentes por **embeddings** (similitud coseno) y, al crear uno
   nuevo, sugiere la **categoría** con una llamada generativa. Cae a matching por
   tokens si no hay IA configurada. Ver §IA abajo.
2. **Verifica/corrige** descuento, tope, modalidad, fin de vigencia y días si el
   parser se equivocó.
3. **Aprueba** → inserta en `promotions` con las mismas validaciones que el CRUD
   manual (XOR de descuento, días 0-6, fechas, card_types, modalidad).

Warnings calculados al importar y mostrados como badges: `comercio_nuevo`,
`sin_fecha_termino`, `sin_tipo_tarjeta`, `descuento_ambiguo`.

## Esquema (idempotente — `scripts/schema.sql`)

- `scraper_runs` — una fila por importación/fetch por banco (total, imported,
  skipped, edge_count, admin).
- `promo_staging` — promos en espera. Mismo shape que `promotions` salvo que
  `merchant_id` puede venir null (se resuelve en revisión) + control
  (`status`, `warnings`, `fingerprint`, `created_promo_id`).

Aplicar: `npm run db:schema` (no destructivo) o `npm run db:seed` (drop + recrea;
ya incluye el drop de las nuevas tablas en orden de FK).

## Dedup

Al importar se calcula un `fingerprint` estable (banco + comercio + descuento +
días + modalidad). Filas con fingerprint ya `pending`/`approved` se omiten — un
re-fetch del mismo mes no duplica el backlog.

## Anti-bot y estrategia de fetch por banco

### Banco de Chile

`sitiospublicos.bancochile.cl` está detrás de Imperva/Incapsula: un fetch desde
datacenter/CI recibe 307→cookie-challenge y luego 403 con reto JS. Por eso el
scraper corre **local** (IP residencial suele pasar) o con `BCH_COOKIE`, o el
fetch se hace dentro de un navegador y se alimenta a `parseEntries()`. Por eso
también el import es **subir un archivo**, no un fetch del servidor.

El panel admin soporta auto-fetch servidor para este banco vía
`POST /api/admin/ops/fetch` (con campo cookie opcional si Imperva bloquea).

### Itaú (`scripts/scrapers/itau.mjs`)

`itaubeneficios.cl` es un sitio WordPress con HTML estático — no requiere
Playwright ni anti-bot especial. El scraper usa `fetch` nativo y hace dos pasadas:

1. **Catálogo maestro** (`/beneficios/beneficios-y-descuentos/`) — extrae la
   lista de comercios con sus URLs, categoría y tarjeta tentativa.
2. **Ficha de cada comercio** — confirma descuento, tarjeta, extrae fechas y tope.
   Pausa cortés de 0.6–1.4 s entre requests.

Con ~100–200 comercios esto tarda **2–4 minutos** — demasiado para la función
serverless de Vercel (60 s). El auto-fetch desde el panel admin está disponible
**solo en entorno local** (Next.js dev o servidor propio); en Vercel, usa el
flujo estándar: **correr localmente → subir JSON**.

```bash
node scripts/scrapers/itau.mjs
# → out/itau.import.json  (sube en /admin/ops/import)
```

Mapeo de tarjetas: Legend, Black, Blue → `credit`; Signature → `itau-black`
(mismo tier, sin slug propio en la DB). Débito detectado por texto.

Días de semana: categorías `lunes-gourmet`…`sabado-gourmet` → `days_of_week`
automático. El resto de categorías → `[]` (todos los días).

### BCI (`scripts/scrapers/bci.mjs`)

`bci.cl/beneficios/beneficios-bci` es una SPA (Angular/React): los datos se
cargan via API interna. El scraper usa **Playwright** para interceptar las
respuestas JSON en tiempo real.

Setup (una sola vez):
```bash
npm install playwright --save-dev
npx playwright install chromium
```

Uso:
```bash
node scripts/scrapers/bci.mjs
# → out/bci.import.json  (sube en /admin/ops/import)
# → out/bci-raw.json     (respuestas crudas, útil para debugging)
```

**No soporta auto-fetch desde el panel admin** (Playwright no puede correr en
Vercel). Flujo obligatorio: local → subir JSON.

Si el scraper captura items pero `discount`/`card_types` quedan vacíos, revisar
`out/bci-raw.json` para ver los nombres reales de los campos de la API, luego
ajustar los `pick()` en `normalizeEntry()` dentro de `bci.mjs`. El bloque
`FIELD MAPPINGS` del código está marcado para eso.

Mapeo de tarjetas: patrón regex sobre el nombre de tarjeta → `card_types` +
`card_ids`. Ver `BCI_CARD_PATTERNS` en el scraper.

## Casos borde (para el final)

El scraper separa lo no-trivial a `out/<banco>.edges.json` y NO lo importa:
cashback, 2x1/segunda unidad, multitramo ("hasta X%"), cuotas sin interés,
puntos/regalo, $ por litro, descuento no parseable. Taxonomía y conteos en
`scripts/scrapers/BANCO-CHILE-FINDINGS.md`. Se modelarán más adelante.

## IA (resolver de comercios)

Capa agnóstica al proveedor en `lib/ai/`:

- `provider.ts` — primitivas `embed()` y `generateJSON()` con dos backends
  intercambiables por `AI_PROVIDER`: **gemini** (Google AI Studio, default) y
  **ollama** (local). Modelos override-ables por env.
- `merchant-suggest.ts` — `rankMerchants` (embeddings + coseno, con cache del
  corpus de ~500 comercios) y `suggestCategory` (generativo). Degradan a tokens
  si no hay backend.
- `POST /api/admin/ops/suggest-merchant` — lo consume la caja de sugerencias.

Por qué embeddings y no un LLM generativo para el match: "¿qué comercio se parece
más a X?" es búsqueda por similitud, no generación — más rápida, barata y estable.
El generativo se reserva para la categoría (y, más adelante, los casos borde).

Config (en `.env.local`, la API key la pones tú):

```
AI_PROVIDER=gemini
GEMINI_API_KEY=...            # https://aistudio.google.com/apikey
# o local:
# AI_PROVIDER=ollama          # requiere `ollama serve` + nomic-embed-text + gemma2
```

Sin nada configurado, la caja cae a matching por tokens (la UI nunca se queda sin
sugerencias).

## Agregar un banco nuevo

1. Escribir `scripts/scrapers/<banco>.mjs` (capa de fetch específica + reusar el
   patrón de parseo determinista → `{bank_id, clean, edge_counts}`).
2. Correrlo, subir el JSON en `/admin/ops/import`, revisar en `/admin/ops/<banco>`.

La capa de extract (parseo a shape `promotions`) es genérica; lo único
específico por banco es el fetch y los mapeos (días, tarjetas, categoría).

## Contrato canónico del scraper

El **shape exacto** de la salida, las reglas campo por campo, la taxonomía de
casos borde, el fingerprint de dedup, los warnings y todos los endpoints `POST`
del pipeline están normados en
[`scripts/scrapers/SCRAPER-SPEC.md`](../scripts/scrapers/SCRAPER-SPEC.md). Ese
documento es la fuente de verdad que mantiene a todos los scrapers en línea — un
scraper nuevo que lo respeta entra por el pipeline sin cambios en el resto del
sistema.
