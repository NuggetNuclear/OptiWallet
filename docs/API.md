# API Reference — OptiWallet

> Última actualización: 2026-06-16 · v1.0.0-beta.1

Referencia completa de los 8 endpoints de la API. Todos son **Route Handlers** (serverless Node.js en Vercel) que consultan **Neon PostgreSQL** directamente.

> **Sprint 2 (US-003):** la API también está documentada en formato **OpenAPI 3.1**:
>
> - Spec machine-readable: [`/api/openapi.json`](https://optiwallet.vercel.app/api/openapi.json) (fuente: `lib/openapi.ts`)
> - **Swagger UI interactivo** (con "Try it out"): [`/api-docs`](https://optiwallet.vercel.app/api-docs) — self-hosted en `public/swagger/` para no abrir la CSP a CDNs.
>
> Si cambias un endpoint, actualiza **ambos**: este documento y `lib/openapi.ts`.

---

## Índice

- [Convenciones generales](#convenciones-generales)
- [GET /api/banks](#get-apibanks)
- [GET /api/cards](#get-apicards)
- [GET /api/categories](#get-apicategories)
- [GET /api/merchants](#get-apimerchants)
- [GET /api/merchants/[merchantId]](#get-apimerchantsmerchantid)
- [GET /api/promotions/[merchantId]](#get-apipromotionsmerchantid)
- [GET /api/recommendations](#get-apirecommendations)
- [GET /api/stats](#get-apistats)

---

## Convenciones generales

### Método HTTP

Todos los endpoints son **solo `GET`** — la API es **pública y de solo lectura**. No hay endpoints `POST`, `PUT`, `DELETE` ni `PATCH`.

### Formato de respuesta

- **Content-Type:** `application/json`
- **Naming:** snake_case (match directo con columnas PostgreSQL)
- **Arrays vacíos:** se devuelve `[]`, no `null`

### Validación de IDs

Todos los IDs que llegan por query string o path params se validan con `lib/validate.ts` antes de tocar la base de datos:

```
Patrón: /^[A-Za-z0-9_.-]{1,64}$/
```

Input malformado → `400 Bad Request` con `{"error":"…inválido"}`.

Esta validación es **defensa en profundidad**: las queries ya van parametrizadas (tagged templates de Neon), pero IDs malformados no tienen por qué llegar a la base.

### Manejo de errores

| Status | Significado | Body |
|---|---|---|
| `200` | OK | Array u objeto con datos |
| `400` | Input inválido | `{"error":"<descripción>"}` |
| `404` | No encontrado | `null` (solo `/api/merchants/[id]`) |
| `500` | Error interno | `{"error":"Error interno"}` |

Los errores 500 **nunca exponen detalles** al cliente — el stack trace va a los logs de Vercel.

### Caching

Todos los endpoints responden con `Cache-Control` para el CDN de Vercel:

| Tipo | `s-maxage` | `stale-while-revalidate` |
|---|---|---|
| Datos estables (banks, cards, categories) | 60s (1 min) | 120s (2 min) |
| Datos dinámicos (merchants, promos, recs, stats) | 60s (1 min) | 300s (5 min) |

---

## GET /api/banks

Retorna todos los bancos e instituciones financieras.

**Archivo:** `app/api/banks/route.ts`

### Parámetros

Ninguno.

### Respuesta

```json
[
  {
    "id": "bci",
    "name": "BCI",
    "short_name": "BCI",
    "available": true,
    "color": "#0033A0"
  },
  {
    "id": "consorcio",
    "name": "Consorcio",
    "short_name": null,
    "available": false,
    "color": null
  }
]
```

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | `string` | Slug único del banco |
| `name` | `string` | Nombre completo |
| `short_name` | `string \| null` | Nombre corto (opcional) |
| `available` | `boolean` | `false` = próximamente, sin promos cargadas |
| `color` | `string \| null` | Color de marca en hexadecimal (ej. `"#0033A0"`) |

**Orden:** bancos disponibles primero (`available DESC`), luego alfabético (`name ASC`).

**Cache:** `s-maxage=60, stale-while-revalidate=120`

### SQL

```sql
SELECT id, name, short_name, available, color
FROM banks
ORDER BY available DESC, name ASC
```

---

## GET /api/cards

Retorna tarjetas (productos de crédito/débito), opcionalmente filtradas por banco.

**Archivo:** `app/api/cards/route.ts`

### Parámetros

| Param | Tipo | Requerido | Descripción |
|---|---|---|---|
| `bankId` | `string` (query) | No | Filtrar por banco. Se valida con `isValidId`. |

### Respuesta

```json
[
  {
    "id": "bci-credit",
    "bank_id": "bci",
    "name": "BCI Crédito",
    "type": "credit"
  },
  {
    "id": "bci-debit",
    "bank_id": "bci",
    "name": "BCI Débito",
    "type": "debit"
  }
]
```

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | `string` | Slug único de la tarjeta |
| `bank_id` | `string` | FK al banco |
| `name` | `string` | Nombre del producto (ej: "Santander Black") |
| `type` | `"credit" \| "debit" \| "prepaid"` | Tipo de tarjeta |

**Orden:** `bank_id`, `type`, `name`.

**Cache:** `s-maxage=60, stale-while-revalidate=120`

### Errores

| Caso | Status | Body |
|---|---|---|
| `bankId` inválido | 400 | `{"error":"bankId inválido"}` |

---

## GET /api/categories

Retorna todas las categorías de comercios con conteo de comercios asociados.

**Archivo:** `app/api/categories/route.ts`

### Parámetros

Ninguno.

### Respuesta

```json
[
  {
    "id": "comida-rapida",
    "label": "Comida Rápida",
    "emoji": "🍔",
    "merchant_count": 12
  },
  {
    "id": "supermercado",
    "label": "Supermercado",
    "emoji": "🛒",
    "merchant_count": 8
  }
]
```

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | `string` | Slug de la categoría |
| `label` | `string` | Nombre visible |
| `emoji` | `string` | Emoji representativo |
| `merchant_count` | `number` | Cantidad de comercios en esta categoría |

**Orden:** alfabético por `label`.

**Cache:** `s-maxage=60, stale-while-revalidate=120`

### SQL

```sql
SELECT mc.id, mc.label, mc.emoji, count(m.id)::int AS merchant_count
FROM merchant_categories mc
LEFT JOIN merchants m ON m.category_id = mc.id
GROUP BY mc.id, mc.label, mc.emoji
ORDER BY mc.label
```

---

## GET /api/merchants

Búsqueda fuzzy de comercios por nombre/aliases, con filtro opcional por categoría.

**Archivo:** `app/api/merchants/route.ts`

### Parámetros

| Param | Tipo | Requerido | Descripción |
|---|---|---|---|
| `q` | `string` (query) | No | Texto de búsqueda (max 80 caracteres, case-insensitive). Busca en `name` y `aliases`. |
| `category` | `string` (query) | No | Filtrar por `category_id`. Se valida con `isValidId`. |

### Respuesta

```json
[
  {
    "id": "papa-johns",
    "name": "Papa John's",
    "category_id": "comida-rapida",
    "aliases": ["papa jones", "papajohns"],
    "category_label": "Comida Rápida",
    "emoji": "🍔",
    "popularity_prior": 0.72
  }
]
```

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | `string` | Slug del comercio |
| `name` | `string` | Nombre oficial |
| `category_id` | `string` | FK a la categoría |
| `aliases` | `string[]` | Nombres alternativos para búsqueda fuzzy |
| `category_label` | `string` | Nombre de la categoría (JOIN) |
| `emoji` | `string` | Emoji de la categoría (JOIN) |
| `popularity_prior` | `number` | Prior de popularidad 0–1 (cold-start del ranking). Default 0.5 si aún no se ha computado. |

**Límite:** máximo 50 resultados.

**Orden:** alfabético por `name`.

**Cache:** `s-maxage=60, stale-while-revalidate=300`

### Búsqueda

- El texto se convierte a lowercase.
- Se escapan comodines de LIKE (`%`, `_`, `\`) para evitar inyección de patrones.
- Se busca con `LIKE '%q%'` en `name` y en cada alias (`unnest(aliases)`).
- Sin `q`, retorna todos los comercios (con filtro de categoría si aplica).

### Errores

| Caso | Status | Body |
|---|---|---|
| `category` inválida | 400 | `{"error":"category inválida"}` |

---

## GET /api/merchants/[merchantId]

Retorna un comercio específico por su ID exacto.

**Archivo:** `app/api/merchants/[merchantId]/route.ts`

### Parámetros

| Param | Tipo | Requerido | Descripción |
|---|---|---|---|
| `merchantId` | `string` (path) | Sí | ID del comercio. Se valida con `isValidId`. |

### Respuesta (200)

```json
{
  "id": "papa-johns",
  "name": "Papa John's",
  "category_id": "comida-rapida",
  "aliases": ["papa jones", "papajohns"],
  "category_label": "Comida Rápida",
  "emoji": "🍔"
}
```

### Respuesta (404)

```json
null
```

**Cache:** `s-maxage=60, stale-while-revalidate=300`

### Errores

| Caso | Status | Body |
|---|---|---|
| ID inválido | 400 | `{"error":"ID inválido"}` |
| No encontrado | 404 | `null` |

---

## GET /api/promotions/[merchantId]

Retorna todas las promociones **activas y vigentes** de un comercio, con el nombre del banco.

**Archivo:** `app/api/promotions/[merchantId]/route.ts`

### Parámetros

| Param | Tipo | Requerido | Descripción |
|---|---|---|---|
| `merchantId` | `string` (path) | Sí | ID del comercio. Se valida con `isValidId`. |

### Respuesta

```json
[
  {
    "id": "bci-papa-johns-martes",
    "bank_id": "bci",
    "card_types": ["credit"],
    "merchant_id": "papa-johns",
    "discount": 25,
    "cap": 5000,
    "min_purchase": 10000,
    "days_of_week": [2],
    "start_date": "2026-04-01T04:00:00.000Z",
    "end_date": "2026-06-30T04:00:00.000Z",
    "modality": "presencial",
    "code": null,
    "conditions": "Compra mínima $10.000",
    "source": "BCI beneficios junio 2026",
    "verified_at": "2026-06-01",
    "active": true,
    "bank_name": "BCI"
  }
]
```

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | `string` | Slug de la promoción |
| `bank_id` | `string` | FK al banco |
| `card_types` | `string[]` | Tipos aplicables: `["credit"]`, `["debit"]`, `["credit","debit"]`, `["prepaid"]` |
| `card_ids` | `string[]` | IDs de tarjetas específicas. Vacío = aplica por `card_types` (sin restricción). Con valores = solo esas tarjetas exactas ("tarjeta única"). |
| `card_names` | `string[]` | Nombres de esas tarjetas específicas (derivado server-side). Vacío si no hay restricción. |
| `merchant_id` | `string` | FK al comercio |
| `discount` | `number \| null` | Porcentaje de descuento (1–100). `null` si la promo usa `discount_per_unit`. |
| `discount_per_unit` | `number \| null` | Descuento fijo en CLP por unidad (ej. $100/L). `null` si usa `discount`. |
| `discount_unit` | `string \| null` | Unidad del descuento por unidad (actualmente solo `"liter"`). `null` si usa `discount`. |
| `stackable` | `boolean` | Si la promo puede combinarse (apilarse) con otras simultáneamente. |
| `cap` | `number \| null` | Tope de descuento en CLP. `null` = sin tope |
| `min_purchase` | `number \| null` | Monto mínimo de compra en CLP. `null` = sin mínimo |
| `days_of_week` | `number[]` | Días aplicables. `0`=dom … `6`=sáb. `[]` = todos los días |
| `start_date` | `string \| null` | Inicio de vigencia (ISO) |
| `end_date` | `string \| null` | Fin de vigencia (ISO) |
| `modality` | `string` | `"presencial"` \| `"online"` \| `"both"` |
| `code` | `string \| null` | Código a ingresar al pagar |
| `conditions` | `string \| null` | Condiciones adicionales en texto libre |
| `source` | `string` | Referencia al origen de la promo |
| `verified_at` | `string` | Fecha de última verificación |
| `active` | `boolean` | Siempre `true` (solo retorna activas) |
| `bank_name` | `string` | Nombre del banco (JOIN) |

**Filtro:** solo promos con `active = true` y `end_date` no vencida (o sin `end_date`).

**Orden:** mayor descuento primero (`discount DESC`).

**Cache:** `s-maxage=60, stale-while-revalidate=300`

### Errores

| Caso | Status | Body |
|---|---|---|
| ID inválido | 400 | `{"error":"ID inválido"}` |

---

## GET /api/recommendations

**★ El endpoint core del producto.** Cruza las tarjetas del usuario con las promos activas de comercios, filtra por día y vigencia, y retorna las mejores recomendaciones ordenadas por descuento.

**Archivo:** `app/api/recommendations/route.ts`

### Parámetros

| Param | Tipo | Requerido | Descripción |
|---|---|---|---|
| `cardIds` | `string[]` (query, repeated) | Sí | IDs de tarjetas del usuario. Máximo 100. Se validan con `areValidIds`. Enviar como `?cardIds=bci-credit&cardIds=santander-debit`. |
| `date` | `string` (query) | No | Fecha `YYYY-MM-DD`. Default: hoy en `America/Santiago`. Se valida formato + validez lógica. |
| `merchantId` | `string` (query) | No | Filtrar por un comercio específico. Se valida con `isValidId`. |

### Respuesta

```json
[
  {
    "promotion_id": "bci-papa-johns-martes",
    "discount": 25,
    "cap": 5000,
    "min_purchase": 10000,
    "days_of_week": [2],
    "start_date": "2026-04-01T04:00:00.000Z",
    "end_date": "2026-06-30T04:00:00.000Z",
    "modality": "presencial",
    "code": null,
    "conditions": "Compra mínima $10.000",
    "source": "BCI beneficios junio 2026",
    "verified_at": "2026-06-01",
    "merchant_id": "papa-johns",
    "merchant_name": "Papa John's",
    "category_id": "comida-rapida",
    "category_label": "Comida Rápida",
    "emoji": "🍔",
    "card_id": "bci-credit",
    "card_name": "BCI Crédito",
    "card_type": "credit",
    "bank_id": "bci"
  }
]
```

| Campo | Tipo | Descripción |
|---|---|---|
| `promotion_id` | `string` | ID de la promoción |
| `discount` | `number \| null` | Porcentaje de descuento. `null` si usa `discount_per_unit`. |
| `discount_per_unit` | `number \| null` | Descuento fijo en CLP por unidad (ej. $100/L). |
| `discount_unit` | `string \| null` | Unidad del descuento por unidad (`"liter"`). |
| `stackable` | `boolean` | Si la promo puede apilarse con otras. |
| `cap` | `number \| null` | Tope en CLP |
| `min_purchase` | `number \| null` | Monto mínimo de compra en CLP |
| `days_of_week` | `number[]` | Días aplicables |
| `start_date` | `string \| null` | Inicio de vigencia |
| `end_date` | `string \| null` | Fin de vigencia |
| `modality` | `string` | Modalidad |
| `code` | `string \| null` | Código |
| `conditions` | `string \| null` | Condiciones |
| `source` | `string` | Fuente |
| `verified_at` | `string` | Última verificación |
| `merchant_id` | `string` | ID del comercio |
| `merchant_name` | `string` | Nombre del comercio |
| `popularity_prior` | `number` | Prior de popularidad 0–1 del comercio (cold-start del ranking). |
| `category_id` | `string` | ID de la categoría |
| `category_label` | `string` | Nombre de la categoría |
| `emoji` | `string` | Emoji de la categoría |
| `card_id` | `string` | ID de la tarjeta del usuario |
| `card_name` | `string` | Nombre de la tarjeta |
| `card_type` | `string` | Tipo (`credit` / `debit` / `prepaid`) |
| `bank_id` | `string` | ID del banco |

**Orden:** mayor descuento primero (`discount DESC`).

**Lógica de match:** una promo aparece si:
1. La tarjeta pertenece al mismo banco que la promo (`c.bank_id = p.bank_id`)
2. Matching de tarjeta (doble rama):
   - Si la promo tiene `card_ids` (≥ 1) → aplica **solo** a esas tarjetas exactas ("tarjeta única", ej. "solo Mastercard Black"), ignorando `card_types`.
   - Si `card_ids` está vacío → aplica a cualquier tarjeta del banco cuyo `type` esté en `card_types` (comportamiento estándar).
3. La promo está activa (`p.active = true`)
4. El día de la semana coincide (`dayOfWeek ∈ days_of_week`, o `days_of_week` vacío = todos)
5. La fecha está dentro del rango de vigencia (si `start_date`/`end_date` existen)

**Sin tarjetas:** si `cardIds` está vacío, retorna `[]` inmediatamente sin consultar la base.

**Cache:** `s-maxage=60, stale-while-revalidate=300`

### Errores

| Caso | Status | Body |
|---|---|---|
| Sin `cardIds` | 200 | `[]` (no es error) |
| Más de 100 tarjetas | 400 | `{"error":"Demasiadas tarjetas"}` |
| `cardIds` inválidos | 400 | `{"error":"cardIds inválidos"}` |
| `merchantId` inválido | 400 | `{"error":"merchantId inválido"}` |
| `date` formato inválido | 400 | `{"error":"Fecha inválida (YYYY-MM-DD)"}` |
| `date` lógicamente inválida | 400 | `{"error":"Fecha inválida"}` |

---

## GET /api/stats

Retorna conteos agregados para la landing page.

**Archivo:** `app/api/stats/route.ts`

### Parámetros

Ninguno.

### Respuesta

```json
{
  "promotions": 47,
  "merchants": 32,
  "banks": 14
}
```

| Campo | Tipo | Descripción |
|---|---|---|
| `promotions` | `number` | Promos activas (`active = true`) |
| `merchants` | `number` | Total de comercios |
| `banks` | `number` | Total de bancos/emisores |

**Fallback:** si la query no retorna filas, responde `{"promotions":0,"merchants":0,"banks":0}`.

**Cache:** `s-maxage=60, stale-while-revalidate=300`
