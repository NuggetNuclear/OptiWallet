# Scraping → staging → revisión → promociones

> Última actualización: 2026-06-30 · v1.0.0-beta.2

Central de operaciones para poblar `promotions` desde las páginas de beneficios
de cada banco, con revisión humana obligatoria antes de producción.

## Flujo end-to-end

```
1. FETCH      scripts/scrapers/<banco>.{mjs,py}  (local; el fetch pasa por
              ↓ out/<banco>.import.json            navegador/IP residencial
                                                     por anti-bot — ver §Anti-bot)
2. IMPORT     /admin/ops/import  → sube el JSON
              ↓                     POST /api/admin/ops/import
3. STAGING    promo_staging (status=pending) + scraper_runs (tracking del fetch)
              ↓
4. REVISIÓN   /admin/ops/<bankId>  → resolver/crear comercio, verificar campos
              ↓                       POST …/staging/<id>/approve | /reject
                                       POST …/[bankId]/approve-all (+ /stream)
                                       POST …/[bankId]/reject-all
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
(pestañas pendientes / aprobadas / rechazadas), alimentada por
`GET /api/admin/ops/[bankId]/staging?status=pending|approved|rejected`.

## Revisión (resolver comercio + verificar)

Por cada fila pendiente el revisor:

1. **Resuelve el comercio** — mapea a uno existente o crea uno nuevo en el acto
   (id, nombre, categoría). La **caja de sugerencias** usa IA: rankea los
   comercios existentes por **embeddings** (similitud coseno) y, al crear uno
   nuevo, sugiere la **categoría** con una llamada generativa. Cae a matching por
   tokens si no hay IA configurada. Ver §IA abajo.
2. **Verifica/corrige** descuento, tope, modalidad, fin de vigencia y días si el
   parser se equivocó. `POST /api/admin/ops/staging/[id]/autofill` puede
   sugerir/corregir todos los campos editables vía IA generativa a partir del
   texto de `conditions` (503 si no hay IA configurada).
3. **Aprueba** → inserta en `promotions` con las mismas validaciones que el CRUD
   manual (XOR de descuento, días 0-6, fechas, card_types, modalidad).

También existe **aprobación/descarte masivo por banco**:
`POST /api/admin/ops/[bankId]/approve-all` (y su variante `/stream` por
Server-Sent Events para reportar progreso) resuelve y crea automáticamente los
comercios nuevos vía IA (`suggestCategoriesBatch`) antes de insertar cada fila
válida en `promotions`. Cada comercio nuevo se asigna a **una categoría macro
existente** (nunca se crean categorías nuevas — si la IA no acierta, cae a
`otros`) y recibe hasta 3 **tags** granulares (Sushi, Delivery, Farmacia…),
creando los tags que falten. `POST /api/admin/ops/[bankId]/reject-all`
descarta de una vez todo lo `pending` de un banco.

Warnings calculados al importar y mostrados como badges: `comercio_nuevo`,
`sin_fecha_termino`, `sin_tipo_tarjeta`, `descuento_ambiguo`, `nombre_muy_largo`.

## Esquema (idempotente — `scripts/schema.sql`)

- `scraper_runs` — una fila por importación/fetch por banco (total, imported,
  skipped, edge_count, admin).
- `promo_staging` — promos en espera. Mismo shape que `promotions` salvo que
  `merchant_id` puede venir null (se resuelve en revisión) + control
  (`status`, `warnings`, `fingerprint`, `created_promo_id`).
- `scraper_raw_cache` — cachea la última respuesta cruda (por `uuid` de
  entrada) del auto-fetch servidor, para no reprocesar entradas sin cambios
  entre corridas de `POST /api/admin/ops/fetch`.

Aplicar: `npm run db:schema` (no destructivo) o `npm run db:seed` (drop + recrea;
ya incluye el drop de las nuevas tablas en orden de FK).

## Dedup

Al importar se calcula un `fingerprint` estable (banco + comercio + descuento +
días + modalidad). Filas con fingerprint ya `pending`/`approved` se omiten — un
re-fetch del mismo mes no duplica el backlog.

## Bancos cubiertos hoy

| Banco (`bank_id`) | Script | Lenguaje | Auto-fetch servidor |
|---|---|---|---|
| `banco-chile` | `scripts/scrapers/banco-chile.mjs` | Node (`.mjs`) | Sí (`POST /api/admin/ops/fetch`) |
| `bci` | `scripts/scrapers/bci_beneficios.py` | Python + Playwright | No — local únicamente |
| `itau` | `scripts/scrapers/scraper_itau.py` | Python (`requests`+`bs4`) | No — local únicamente |
| `falabella` | `scripts/scrapers/banco_falabella.py` | Python (`requests`) | No — local únicamente |
| `santander` | `scripts/scrapers/banco_santander.py` | Python (`requests`) | No — local únicamente |

Los cinco bancos están seedeados en `banks` (`scripts/seed.ts`). Solo Banco de
Chile tiene fetch desde el servidor; el resto sigue el flujo estándar
**correr localmente → subir `out/<banco>.import.json` en `/admin/ops/import`**.

## Anti-bot y estrategia de fetch por banco

### Banco de Chile (`scripts/scrapers/banco-chile.mjs`)

`sitiospublicos.bancochile.cl` está detrás de Imperva/Incapsula: un fetch desde
datacenter/CI recibe 307→cookie-challenge y luego 403 con reto JS. Por eso el
scraper corre **local** (IP residencial suele pasar) o con `BCH_COOKIE`, o el
fetch se hace dentro de un navegador y se alimenta a `parseEntries()`.

Es el **único banco con auto-fetch servidor**:
`POST /api/admin/ops/fetch` (con campo `cookie` opcional si Imperva bloquea,
devuelve `428` con instrucciones si la cookie guardada ya no sirve). La cookie
exitosa se persiste en `app_settings` (`bch_cookie_banco-chile`) para
reutilizarla en corridas futuras. El fetch además compara contra
`scraper_raw_cache` (por `uuid` de cada entrada) para solo reparsear lo que
cambió desde la última corrida.

```bash
node scripts/scrapers/banco-chile.mjs
BCH_COOKIE="visid_incap_...; incap_ses_..." node scripts/scrapers/banco-chile.mjs
# → out/banco-chile.clean.json + out/banco-chile.edges.json + out/banco-chile.import.json
```

### Itaú (`scripts/scrapers/scraper_itau.py`)

`itaubeneficios.cl` es un sitio WordPress con HTML estático — no requiere
Playwright ni anti-bot especial. El scraper usa `requests` + `BeautifulSoup` y
hace dos pasadas:

1. **Catálogo maestro** (`/beneficios/beneficios-y-descuentos/`) — extrae la
   lista de comercios con sus URLs, categoría y tarjeta tentativa.
2. **Ficha de cada comercio** — confirma descuento, tarjeta, extrae fechas y tope.
   Pausa cortés de 0.6–1.4 s entre requests.

Con ~100–200 comercios esto tarda **2–4 minutos**, además de no estar wireado
al auto-fetch servidor. Flujo: **correr localmente → subir JSON**.

```bash
pip install requests beautifulsoup4
python scripts/scrapers/scraper_itau.py
# → out/itau.import.json  (sube en /admin/ops/import)
# → out/itau.raw.json     (datos crudos, para depuración)
```

Mapeo de tarjetas: Legend, Black, Blue → `credit`; Signature → tier `itau-black`
(mismo tier, sin slug propio en la DB). Débito detectado por texto.

Días de semana: categorías `lunes-gourmet`…`sabado-gourmet` → `days_of_week`
automático. El resto de categorías → `[]` (todos los días).

### BCI (`scripts/scrapers/bci_beneficios.py`)

`bci.cl/beneficios/beneficios-bci` es una SPA (Angular/React): los datos se
cargan vía la API interna `api.bciplus.cl/bff-loyalty-beneficios/v1/offers`,
que requiere un subscription key solo disponible en el contexto del navegador.
El scraper usa **Playwright (Python)** para interceptar las respuestas JSON en
tiempo real sin necesitar conocer el key.

Setup (una sola vez):
```bash
pip install playwright
playwright install chromium
```

Uso:
```bash
python scripts/scrapers/bci_beneficios.py
# → out/bci.import.json  (sube en /admin/ops/import)
# → out/bci.raw.json     (respuestas crudas, útil para debugging)
```

**No soporta auto-fetch desde el panel admin** (Playwright no puede correr en
Vercel). Flujo obligatorio: local → subir JSON.

Si el scraper captura items pero `discount`/`card_types` quedan vacíos, revisar
`out/bci.raw.json` para ver los nombres reales de los campos de la API, luego
ajustar los `nested_get()` en `to_scraped_row()` dentro de `bci_beneficios.py`.

Mapeo de tarjetas: detección de texto/campos estructurados (`credito`/`debito`/
`prepago`) → `card_types`; siempre emite `card_ids: []` (no se asignan slugs
granulares).

### Banco Falabella (`scripts/scrapers/banco_falabella.py`)

`bancofalabella.cl/descuentos/todos` es Next.js App Router (SSR): los datos de
todas las tarjetas de beneficio vienen embebidos en el RSC payload que la misma
URL devuelve cuando se pide con `Accept: text/x-component` — sin JavaScript, sin
Playwright. El scraper descarga ese payload con `requests` y extrae el array
`benefitCardsData` (200+ tarjetas) parseando el texto doblemente escapado.

```bash
pip install requests
python scripts/scrapers/banco_falabella.py
# → out/banco-falabella.import.json  (sube en /admin/ops/import)
```

Sin auto-fetch servidor. Mapeo de tarjetas vía `CARD_TYPE_MAP` (CMR Mastercard
→ `credit`, débito Banco Falabella → `debit`). Días vía `discountDays`; si trae
los 7 días se normaliza a `[]`. Descuentos no porcentuales (puntos CMR, cuotas
sin interés, "hasta/desde X%", regalos) se clasifican a `edges` en
`get_discount()`.

### Banco Santander (`scripts/scrapers/banco_santander.py`)

`banco.santander.cl/beneficios` corre sobre Modyo CMS, con una API JSON
paginada sin Playwright: `GET /beneficios/promociones.json?per_page=50&page=N&custom_fields=true`.

```bash
pip install requests
python scripts/scrapers/banco_santander.py
# → out/santander.import.json  (sube en /admin/ops/import)
```

Sin auto-fetch servidor. Días y tipo de tarjeta vienen de `tags` de Modyo
(`DAY_TAGS`, `CREDIT_TAGS`/`DEBIT_TAGS`/`ALL_CARD_TAGS`). El campo `Vigencia`
(texto libre en español, ej. "Desde el 1 de junio hasta el 31 de agosto de
2026") se parsea con varias regex a `start_date`/`end_date`.

> Nota: este scraper emite `_source_tags` en vez de `_source_cards` (única
> desviación del contrato §4.2 de `SCRAPER-SPEC.md`); el importer lo ignora
> sin error porque `normalizeRow` solo lee `_source_cards`, así que
> `source_cards` queda vacío en staging para este banco.

## Casos borde (para el final)

El scraper separa lo no-trivial a `out/<banco>.edges.json` y NO lo importa:
cashback, 2x1/segunda unidad, multitramo ("hasta X%"), cuotas sin interés,
puntos/regalo, $ por litro, descuento no parseable. Taxonomía y conteos del
prototipo (Banco de Chile) en
[`scripts/scrapers/doc-scraperBChile.md`](../scripts/scrapers/doc-scraperBChile.md).
Se modelarán más adelante.

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

1. Escribir `scripts/scrapers/<banco>.mjs` (Node) o `<banco>.py` (Python) —
   capa de fetch específica + reusar el patrón de parseo determinista →
   `{bank_id, clean, edge_counts}`. El lenguaje no importa: lo único que se
   sube al panel es el `<banco>.import.json` resultante, y debe respetar el
   contrato de [`SCRAPER-SPEC.md`](../scripts/scrapers/SCRAPER-SPEC.md). Hoy
   conviven ambos: `banco-chile.mjs` en Node, y `bci_beneficios.py` /
   `scraper_itau.py` / `banco_falabella.py` / `banco_santander.py` en Python.
2. Correrlo, subir el JSON en `/admin/ops/import`, revisar en `/admin/ops/<banco>`.

La capa de extract (parseo a shape `promotions`) es genérica; lo único
específico por banco es el fetch y los mapeos (días, tarjetas, categoría). Solo
Banco de Chile tiene auto-fetch desde el servidor (`POST /api/admin/ops/fetch`);
el resto requiere correr el script localmente y subir el JSON.

## Contrato canónico del scraper

El **shape exacto** de la salida, las reglas campo por campo, la taxonomía de
casos borde, el fingerprint de dedup, los warnings y todos los endpoints `POST`
del pipeline están normados en
[`scripts/scrapers/SCRAPER-SPEC.md`](../scripts/scrapers/SCRAPER-SPEC.md). Ese
documento es la fuente de verdad que mantiene a todos los scrapers en línea — un
scraper nuevo que lo respeta entra por el pipeline sin cambios en el resto del
sistema.
