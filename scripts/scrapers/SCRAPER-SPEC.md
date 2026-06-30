# Especificación del scraper — contrato canónico

> Documento normativo. Define **qué debe producir** todo scraper de beneficios
> bancarios y **bajo qué reglas**, para que cualquier banco entre por el mismo
> pipeline `scraper → import → staging → revisión → promotions`.
>
> Si un scraper nuevo respeta este contrato, el resto del sistema (importer,
> dedup, revisión, aprobación) funciona sin cambios. Si lo viola, el importer
> lo rechaza (400) o ensucia el backlog. **No improvises el shape: este es el
> shape.**
>
> Lectura previa obligatoria: [`docs/SCRAPING.md`](../../docs/SCRAPING.md) (flujo
> end-to-end y panel de operaciones). Referencia de implementación:
> [`banco-chile.mjs`](./banco-chile.mjs) + [`doc-scraperBChile.md`](./doc-scraperBChile.md)
> (prototipo/hallazgos). Bancos cubiertos hoy: `banco-chile` (Node, único con
> auto-fetch servidor), `bci`, `itau`, `falabella`, `santander` (Python, todos
> solo-local). El lenguaje del script es libre — Node `.mjs` o Python `.py` —
> mientras el JSON de salida respete este contrato.

---

## 0. Alcance

El scraper **solo extrae y normaliza**. No escribe en la base de datos, no llama
LLMs, no aprueba nada. Su único entregable es un archivo JSON (`out/<banco>.import.json`)
que un admin sube a `POST /api/admin/ops/import`. Todo lo que afecta a `promotions`
—el dato que mueve plata del usuario— pasa por revisión humana aguas abajo.

---

## 1. Principios (toda implementación los acata)

1. **Determinismo en el camino principal.** Parseo = regex + mapas. Sin LLM, sin
   azar, sin red en el `parseEntries`. La misma entrada produce la misma salida.
   El LLM existe solo aguas abajo (autofill/sugerencias en la revisión), nunca
   dentro del scraper.
2. **Separación fetch / extract.** Lo único específico de cada banco es la **capa
   de fetch** (URLs, anti-bot, paginación) y los **mapas** (días, tarjetas,
   categoría). La capa de extracción produce el mismo shape para todos.
3. **No escribe a la DB.** Salida a `out/*.json`. Punto.
4. **Lo dudoso no se importa: se aparta.** Si el descuento no es un porcentaje
   limpio o $/unidad inequívoco, la fila va a `edges`, no a `clean`. Mejor dejar
   una promo afuera que meter un dato falso. Ver §5.
5. **Conservador por defecto.** Ante ambigüedad: `stackable=false`,
   `modality="presencial"`, `days_of_week=[]` (todos los días) solo si de verdad
   no hay restricción. No inventes topes ni fechas.
6. **Trazabilidad.** Cada fila lleva `source` (URL del beneficio). Sin `source`,
   la promo no se puede aprobar (§8).
7. **Idempotencia.** Re-correr el scraper el mismo mes no duplica el backlog: el
   importer deduplica por `fingerprint` (§6). El scraper no necesita llevar estado.
8. **Re-fetch barato.** El fetch debe paginar hasta agotar el origen y tener un
   guard de páginas. No asumir un total fijo.

---

## 2. Arquitectura en capas

```
┌─ específico por banco ─┐   ┌──────── genérico (este contrato) ────────┐
   fetch(URLs, anti-bot)  →   parseEntries(raw) → { clean[], edges{} }  →  out/*.json
   mapas(días/tarjetas)                                                       ↓
                                                              POST /api/admin/ops/import
```

---

## 3. Interfaz del módulo

Cada scraper vive en `scripts/scrapers/<banco>.{mjs,py}` y **debe**:

- **Escribir tres archivos en `scripts/scrapers/out/`**:

  | Archivo | Contenido | ¿Se sube? |
  |---|---|---|
  | `<banco>.clean.json` | array de `ScrapedRow` (candidatos) | no (inspección) |
  | `<banco>.edges.json` | casos borde agrupados por tipo | **no** (TODO manual) |
  | `<banco>.import.json` | **el sobre que se sube al panel** | **sí** |

  (algunos scrapers además escriben `<banco>.raw.json`/`<banco>-raw.json` con
  la respuesta cruda del origen, solo para debugging — no forma parte del
  contrato.)
- **No** escribir a la DB, ni importar `lib/db`, ni secretos de runtime, ni
  `server-only`. El scraper es un script de línea de comandos aislado.

**Caso especial: auto-fetch servidor.** Solo si el banco va a soportar
`POST /api/admin/ops/fetch` (auto-fetch desde el panel admin, ver §12 y
`app/api/admin/ops/fetch/route.ts`) el scraper debe ser **Node `.mjs`
(`// @ts-check`)** y además:

- **Exportar `parseEntries(entries) → { clean, edges }`** — función pura,
  reutilizable desde un navegador cuando el anti-bot obliga a hacer el fetch
  dentro de la página (ver §12). `clean` es un array de `ScrapedRow`; `edges` es
  un objeto `{ <tipo_borde>: Record[] }`.
- **Exportar `fetchAll(cookie?, opts?) → Promise<entries[]>`** — la capa de
  fetch, también invocable desde la ruta API (`loadScraper()` la carga vía
  `import()` dinámico en runtime para evitar el bundling de webpack/turbopack).
- **Tener un `main()` con guard de ejecución directa**, para que importar
  `parseEntries`/`fetchAll` no dispare el fetch por sí solo:
  ```js
  if (import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(...)
  ```

Hoy solo `banco-chile.mjs` cumple este caso especial (único banco con
auto-fetch). Los scrapers Python (`bci_beneficios.py`, `scraper_itau.py`,
`banco_falabella.py`, `banco_santander.py`) son CLIs locales puros — no
exportan nada reutilizable por la ruta API, solo deben producir los tres
archivos de salida de la tabla de arriba. Flujo obligatorio para ellos:
correr local → subir `<banco>.import.json` en `/admin/ops/import`.

---

## 4. Contrato de salida — el payload de import

### 4.1 El sobre (`<banco>.import.json`)

Es exactamente el body que acepta `POST /api/admin/ops/import`:

```jsonc
{
  "bank_id": "banco-chile",          // OBLIGATORIO. slug válido y EXISTENTE en banks
  "generated_at": "2026-06-18T...",  // opcional, informativo (timestamp de la corrida)
  "edge_counts": {                   // opcional. conteo por tipo de caso borde apartado
    "multi_tramo_o_ambiguo": 144,
    "cuotas_sin_interes": 47
  },
  "clean": [ /* ScrapedRow[] */ ]    // OBLIGATORIO. array NO vacío, máx 5000 filas
}
```

Reglas que aplica el importer sobre el sobre (devuelve `400` si no se cumplen):

- `bank_id` válido contra `^[A-Za-z0-9_.-]{1,64}$` **y** existente en la tabla `banks`.
- `clean` es un array no vacío.
- `clean.length ≤ 5000` (`MAX_ROWS`).
- `edge_counts` se suma para registrar `edge_count` en `scraper_runs`; los casos
  borde **no se incluyen** en `clean`, solo su conteo.

### 4.2 `ScrapedRow` — los campos de cada fila

Tipo fuente de verdad: `ScrapedRow` en [`lib/staging.ts`](../../lib/staging.ts).
Todos los campos son opcionales en el tipo, pero el contrato de negocio (y la
aprobación aguas abajo) exige los marcados **(req. para aprobar)**.

| Campo | Tipo | Regla / convención |
|---|---|---|
| `merchant_name` | `string` | Nombre crudo del comercio. **≤ 40 caracteres** (`MERCHANT_NAME_MAX_LENGTH`); si excede, hoy el importer **no descarta la fila** — solo agrega el warning `nombre_muy_largo` (la fila igual entra a staging). El límite duro de 40 caracteres sí se aplica al **aprobar** un comercio nuevo (`POST …/staging/[id]/approve` devuelve `400` si `new_merchant.name` excede el límite). El campo `rejected_names` de la respuesta de `import`/`fetch` existe en el shape pero el importer actual siempre lo deja en `[]` — no hay lógica de descarte por nombre implementada todavía. Es la base del slug y del fingerprint. |
| `merchant_id` | `string \| null` | Slug del comercio si lo resolviste, o `"NEW:<slug>"` si es nuevo. El importer quita el prefijo `NEW:` y **auto-resuelve** si el slug ya existe en `merchants`; si no, queda `null` + warning `comercio_nuevo`. Puedes dejarlo `null` y dejar que resuelva por nombre. |
| `discount` | `int \| null` | Porcentaje **1–100**. Parte del XOR de descuento (§4.3). |
| `discount_per_unit` | `int \| null` | Monto **> 0** por unidad (ej. $/litro de bencina). Parte del XOR. |
| `discount_unit` | `string \| null` | Unidad. **Hoy solo `"liter"`**. Obligatorio junto con `discount_per_unit`. |
| `cap` | `int \| null` | Tope de ahorro en CLP, entero **≥ 0**. Sin separadores de miles. `null` si no hay tope. |
| `min_purchase` | `int \| null` | Compra mínima en CLP, entero **≥ 0**. `null` si no aplica. |
| `days_of_week` | `int[]` | Enteros **0–6**, `0=domingo … 6=sábado`. **`[]` significa TODOS los días**, no "ningún día". Sin duplicados, ordenado. |
| `card_types` | `string[]` | Subconjunto de `["credit","debit","prepaid"]`. **(req. para aprobar: ≥ 1)**. Vacío → warning `sin_tipo_tarjeta`. |
| `card_ids` | `string[]` | **No lo uses para "tarjeta única".** El importer NO lo filtra: lo copia tal cual a la columna `card_ids` de `promo_staging` (mismo nombre, sin renombrar). Si tu scraper resuelve IDs reales del banco (ej. `itau-legend`) puede poblarlo, pero el flujo recomendado es dejarlo `[]` y usar `_source_cards`/`card_types` — la asignación granular real de "tarjeta única" se hace en la revisión humana, no en el scraper. |
| `_source_cards` | `string[]` | Slugs/etiquetas de tarjeta crudos del banco (`visa-credito-infinite`, etc). El importer los copia a la columna `source_cards` de staging (nota el nombre sin guion bajo) para granularidad futura. Preferí este campo sobre `card_ids` para no contaminar el filtro real. **Atención:** el nombre exacto del campo en `ScrapedRow` es `_source_cards` — un scraper que emita otro nombre (p. ej. `_source_tags`) no será leído por `normalizeRow` y `source_cards` quedará vacío en staging para esas filas (ver el caso de `banco_santander.py` en `docs/SCRAPING.md`). |
| `modality` | `string \| null` | `"presencial"` \| `"online"` \| `"both"`. **(req. para aprobar)**. Default conservador `"presencial"`. |
| `start_date` | `string \| null` | `YYYY-MM-DD`. Inicio de vigencia. |
| `end_date` | `string \| null` | `YYYY-MM-DD`. Fin de vigencia. `null` → warning `sin_fecha_termino`. |
| `stackable` | `boolean` | `true` solo si el texto afirma que es acumulable. Default `false`. |
| `code` | `string \| null` | Código promocional si existe (ej. `"VERANO25"`). |
| `conditions` | `string \| null` | Texto de condiciones, **limpio (sin HTML)**, en español. Es la fuente que usa el autofill por IA aguas abajo. |
| `source` | `string \| null` | **URL del beneficio. (req. para aprobar: no vacío.)** Sin esto la promo no entra a producción. |

> El staging copia `card_ids` tal cual lo manda el scraper (default `[]` si se
> omite) y agrega `warnings[]`, `fingerprint`, `status`, etc. — esos los calcula
> el importer, **el scraper no los manda**.

### 4.3 Convenciones de datos (las que más se rompen)

- **Descuento es XOR.** Exactamente uno de los dos modos:
  - **Porcentual**: `discount` ∈ 1–100, con `discount_per_unit` y `discount_unit` en `null`.
  - **Por unidad**: `discount_per_unit` > 0 **y** `discount_unit="liter"`, con `discount` en `null`.

  Ni ambos ni ninguno. Si tu parseo no logra dejarlo en uno de estos dos estados,
  **es un caso borde** (§5), no una fila limpia. El importer marca warning
  `descuento_ambiguo` si detecta el empate, y la aprobación lo rechaza con 400.
- **Días**: `[]` = todos los días. `[3]` = solo miércoles. `[1,2]` = lunes y martes.
- **Tarjetas**: colapsa la granularidad del banco a `card_types`
  (`credit`/`debit`/`prepaid`) y guarda lo fino en `_source_cards`. No metas slugs
  propietarios en `card_types`.
- **Montos CLP**: enteros sin puntos (`50000`, no `"50.000"` ni `50.000`).
- **Fechas**: `YYYY-MM-DD` y nada más. `end_date` no puede ser anterior a
  `start_date` (se valida al aprobar). Ojo: si tomas la fecha de "publicación" del
  CMS no es la vigencia real — documenta la diferencia (ver hallazgo BCh §5.3 en
  `doc-scraperBChile.md`).
- **`source`**: URL absoluta y estable al detalle del beneficio.

---

## 5. Casos borde — qué NO va en `clean`

Lo que no se puede modelar hoy como `% ` o `$/unidad` limpio se **aparta** a
`edges` (agrupado por tipo) y se reporta solo como conteo en `edge_counts`.
**Nunca se importa.** Taxonomía vigente (de [`doc-scraperBChile.md`](./doc-scraperBChile.md),
el prototipo Banco de Chile; los scrapers posteriores reusan el mismo set de
tipos, ver `TIPO_EDGE`/`classify_edge`/`get_discount` en cada `.py`):

| Tipo (`edge`) | Qué es | Destino futuro |
|---|---|---|
| `multi_tramo_o_ambiguo` | "Hasta X%", varios % distintos | descuento variable / LLM |
| `puntos_o_regalo` | puntos, gift card, canje, millas | mecánica aparte |
| `descuento_no_parseable` | no se extrae el % | LLM lee la descripción |
| `cuotas_sin_interes` | financiamiento, no descuento | excluir o tipo nuevo |
| `cashback` | devolución | requiere campo cashback |
| `2x1_o_segunda_unidad` | 2x1, segundo a 50% | mecánica no porcentual |
| `por_litro` | $ por litro de combustible | mapea a `discount_per_unit`+`discount_unit` (ya soportado: si lo parseas limpio, **va a `clean`**, no a edges) |
| `sin_tarjeta_mapeada` | no se resolvió ningún `card_type` | revisar mapa de tarjetas |

Regla de oro: **ante la duda, edge.** El triage manual es barato; un dato de
ahorro falso en producción no.

---

## 6. Dedup y fingerprint

El importer calcula un `fingerprint` estable por fila y omite las que ya estén
`pending`/`approved` para ese banco (y duplicados dentro del mismo lote):

```
sha1( bank_id | slug(merchant_name) | discount | discount_per_unit
      | days_of_week(ordenados) | card_types(ordenados) | modality ).slice(0,16)
```

Consecuencias para el scraper:
- **No incluye fechas ni el merchant resuelto** → re-fetch del mismo mes con
  vigencia actualizada **no** duplica.
- Dos promos del mismo comercio que difieren solo en días/tarjeta/descuento/modalidad
  son filas distintas (fingerprint distinto). Correcto.
- No necesitas deduplicar tú: emite todo lo limpio, el importer se encarga.

---

## 7. Warnings (no bloqueantes)

El importer calcula `warnings[]` por fila y la revisión los muestra como badges.
No bloquean el staging, pero indican qué revisar:

| Warning | Causa |
|---|---|
| `comercio_nuevo` | el slug no existe en `merchants` (hay que crear/mapear) |
| `sin_fecha_termino` | `end_date` vacío |
| `sin_tipo_tarjeta` | `card_types` vacío |
| `descuento_ambiguo` | no hay exactamente un modo de descuento (XOR roto) |
| `nombre_muy_largo` | `merchant_name` > 40 (esta fila además se **descarta**) |

Minimizar warnings es señal de calidad del parseo, pero no es obligatorio.

---

## 8. Qué debe cumplir una fila para llegar a `promotions`

La aprobación (`approve`, `approve-all`) revalida con las **mismas reglas que el
CRUD manual** ([`lib/validate.ts`](../../lib/validate.ts)). Una fila que no pase
queda atascada en staging. Para que apruebe sin fricción, el scraper debe producir:

- **Descuento XOR válido** (`isValidDiscountConfig`): `discount` 1–100 **o**
  `discount_per_unit` > 0 + `discount_unit="liter"`.
- **`card_types` con ≥ 1 tipo válido** (`isValidCardTypes`).
- **`modality`** ∈ `presencial | online | both`.
- **`days_of_week`** enteros 0–6 (`isValidDaysOfWeek`).
- **`cap` / `min_purchase`** enteros ≥ 0 o `null` (`isNonNegativeIntOrNull`).
- **Fechas** `YYYY-MM-DD` válidas; `end_date ≥ start_date`.
- **`source` no vacío.**
- El `merchant_id` final debe existir (se resuelve o se crea en la revisión).

---

## 9. Endpoints `POST` del sistema

El scraper **solo** habla con `import`. El resto son los pasos aguas abajo que
consumen su salida (revisión/aprobación) más el CRUD/admin que comparte
validaciones. Tenerlos presentes evita reinventar shapes.

### 9.1 Pipeline de scraping (consume la salida del scraper)

| Método + ruta | Rol | Body (resumen) |
|---|---|---|
| `POST /api/admin/ops/import` | **entrada del scraper** → `promo_staging` (+ `scraper_runs`) | `{ bank_id, clean[], edge_counts? }` → `201 { run_id, total, imported, skipped, edge_count, rejected_names }` |
| `POST /api/admin/ops/fetch` | auto-fetch + import en un paso (solo `banco-chile` hoy) | `{ bank_id, cookie? }` → `201` (mismo resumen que `import` + `raw_entries`, `edge_counts`) o `428` si Imperva pide cookie |
| `GET /api/admin/ops/overview` | backlog/estado por banco para la central de operaciones | — → `{ banks[], totals }` |
| `GET /api/admin/ops/[bankId]/staging?status=` | cola de revisión de un banco (`pending`\|`approved`\|`rejected`) | — → array de filas de `promo_staging` |
| `POST /api/admin/ops/suggest-merchant` | sugiere comercio existente (embeddings) o categoría al crear | `{ name, withCategory? }` → `{ provider, candidates, suggested_category }` |
| `POST /api/admin/ops/staging/[id]/autofill` | IA rellena/corrige campos de una fila (mismo shape que `overrides`) | `—` (lee la fila) → objeto de campos; `503` si no hay IA |
| `POST /api/admin/ops/staging/[id]/approve` | aprueba una fila → inserta en `promotions` | `{ merchant_mode, merchant_id?, new_merchant?, overrides? }` |
| `POST /api/admin/ops/staging/[id]/reject` | descarta una fila | `—` |
| `POST /api/admin/ops/[bankId]/approve-all` | aprobación masiva: auto-crea comercios/categorías nuevas vía IA (`suggestCategoriesBatch`) y luego inserta cada fila válida | `—` → `{ message, approvedCount, createdMerchantsCount, createdCategoriesCount, errors? }` |
| `POST /api/admin/ops/[bankId]/approve-all/stream` | igual que `approve-all` pero progreso incremental vía Server-Sent Events | `—` → `text/event-stream` |
| `POST /api/admin/ops/[bankId]/reject-all` | descarta de una vez todo lo `pending` de un banco | `—` → `{ rejectedCount }` |

### 9.2 CRUD de datos (comparten validaciones; útil para creación manual/edición)

| Método + ruta | Crea |
|---|---|
| `POST /api/admin/data/banks` | banco |
| `POST /api/admin/data/cards` | tarjeta |
| `POST /api/admin/data/categories` | categoría de comercio |
| `POST /api/admin/data/merchants` | comercio |
| `POST /api/admin/data/promotions` | promoción (alta manual, mismas reglas que approve) |
| `POST /api/admin/data/promotions/bulk-delete` | borrado masivo |

### 9.3 Admin / sesión (no tocan datos de promo)

`POST /api/admin/auth/login`, `/api/admin/auth/verify-totp`,
`/api/admin/auth/logout`, `/api/admin/users`,
`/api/admin/users/[id]/totp-setup`, `/api/admin/maintenance`.

> **Auth**: todos los `POST` de `/api/admin/*` (salvo `login`) exigen sesión admin
> válida (`requireAdmin`). El import se hace **subiendo el archivo desde el panel
> autenticado**, no con un POST anónimo desde el scraper.

---

## 10. Respuestas y errores del importer

`POST /api/admin/ops/import`:

- **`201`** `{ run_id, total, imported, skipped, edge_count, rejected_names }`
  - `imported`: filas nuevas a staging · `skipped`: duplicados por fingerprint ·
    `rejected_names`: reservado para nombres descartados por exceder 40 chars,
    pero **el importer actual no implementa ese descarte** — siempre devuelve
    `[]`. Una fila con `merchant_name` > 40 caracteres hoy entra igual a
    staging con el warning `nombre_muy_largo` (ver §4.2/§7). El límite duro de
    40 caracteres solo se aplica al aprobar un comercio **nuevo** vía
    `POST …/staging/[id]/approve`.
- **`400`**: `bank_id` inválido/inexistente · `clean` no es array no vacío ·
  `clean` > 5000 filas.
- **`401`**: sin sesión admin.
- **`500`**: error interno.

`POST /api/admin/ops/fetch` añade además **`428`** (`error: "cookie_required"`,
con `instructions[]`) cuando el origen bloquea por anti-bot y no hay cookie
guardada o la guardada ya expiró.

---

## 11. Checklist — agregar un banco nuevo

1. Crear el registro del banco (`POST /api/admin/data/banks` o seed) — `bank_id`
   debe existir antes de importar.
2. Escribir `scripts/scrapers/<banco>.mjs` (Node) o `<banco>.py` (Python) —
   el contrato es sobre el JSON de salida, no sobre el lenguaje:
   - Capa de fetch específica (paginación + anti-bot, §12).
   - Mapas: días → 0–6, tarjetas → `card_types` (+ `_source_cards`), modalidad.
   - Clasificador de casos borde (`classifyEdge()`/`classify_edge()`/
     `get_discount()` según el script) para apartar lo no-trivial (§5).
   - Si el banco va a soportar auto-fetch servidor: `.mjs`, con `parseEntries()`
     y `fetchAll()` exportadas + `main()` con guard de ejecución directa (§3).
     Si no (caso por defecto), un `main()`/CLI normal basta.
   - Emitir `clean.json`, `edges.json`, `import.json` en `scripts/scrapers/out/`.
3. Correrlo, revisar el resumen (clean vs. edges vs. resueltos).
4. Subir `out/<banco>.import.json` en `/admin/ops/import`.
5. Revisar en `/admin/ops/<banco>`: resolver comercios, verificar campos, aprobar
   (individualmente o con `approve-all`/`approve-all/stream`).
6. Documentar hallazgos en `scripts/scrapers/<BANCO>-FINDINGS.md` o similar
   (origen de datos, mapeo de campos, conteos, limitaciones) — como
   [`doc-scraperBChile.md`](./doc-scraperBChile.md) para Banco de Chile. Hoy
   es el único banco con ese documento; los cuatro scrapers Python no tienen
   su propio findings doc todavía.

---

## 12. Anti-bot (frágil por diseño)

La única parte frágil del pipeline es el fetch. Varios sitios (ej.
`sitiospublicos.bancochile.cl` detrás de Imperva/Incapsula) bloquean fetch desde
datacenter/CI (`307 → cookie-challenge → 403`). Por eso:

- El scraper corre **local** (IP residencial suele pasar el reto simple), o
- se pasa una cookie válida de un navegador real (`BCH_COOKIE` / archivo
  gitignored), o
- se hace el fetch **dentro de un navegador** y se alimenta el JSON a
  `parseEntries()` (de ahí que sea una export pura).

Por lo mismo el import es **subir un archivo**, no un fetch del servidor. Mensajes
de error del fetch deben guiar a la solución (ver `impervaHelp()` en
`banco-chile.mjs`).
</content>
</invoke>
