# Batería de Pruebas Unitarias de OptiWallet

Runner nativo de Node.js (`node:test` + `node:assert`) — sin Jest, sin Vitest, cero dependencias de testing.

## Estructura

```
tests/                          # Suite principal
├── README.md
├── analytics.test.ts           # Wrapper Plausible: trackEvent + helpers tipados
├── api-client.test.ts          # Wrappers de fetch: URLs, params, códigos HTTP
├── rate-limit.test.ts          # Limiter de ventana fija en memoria (lib/rate-limit.ts)
├── recommendations.test.ts     # Motor de ahorro: savings (%/litro), ranking
├── schema.test.ts              # Integridad de scripts/schema.sql (incl. merchant_tags, merchant_tag_map, promo_reports)
├── standalone.test.ts          # Detección PWA standalone + sincronización de cookie
└── validate.test.ts            # Sanitización de IDs + validadores de escritura (usados por el repo admin, duplicados aquí)

lib/
├── format.test.ts              # Formatters: fechas, días, CLP, modality, descuento
├── recommendations.test.ts     # promoAppliesToCard (matching de tarjeta única)
└── hooks/use-today.test.ts     # parseDiaParam, effectiveDateFor
```

> **Glob de `npm test`**: los patrones van **entre comillas** (`"lib/**/*.test.ts"`)
> para que los expanda el runner de Node (soporta `**`), no el shell. Sin comillas,
> `sh` expande `lib/**` solo a `lib/hooks/` y se saltaría silenciosamente los tests
> de `lib/format.test.ts` y `lib/recommendations.test.ts`.

## Ejecutar

```bash
npm test              # todas las pruebas (lib/**/*.test.ts + tests/**/*.test.ts)
npm run test:watch    # modo observador
npm run test:coverage # con reporte de cobertura nativo de Node
node --test tests/validate.test.ts   # un archivo específico
```

## Cobertura por módulo

### `lib/recommendations.ts` — 100% líneas/funciones
- **promoAppliesToCard** (`lib/recommendations.test.ts`): matching por banco, `cardTypes` sin restricción, `cardIds` ("tarjeta única"), exclusión de otras tarjetas del banco, otro banco, múltiples cardIds
- **calculateSavings**: monto 0/negativo, borde en minPurchase, tope exacto/superado/bajo, descuento 0%/100%, tope=0, redondeo, millones
- **calculateSavingsPerUnit** (descuento $/litro): 0/negativo litros, sin tope, tope superado/no, tope=0, litros fraccionarios
- **calculateSavingsForRec**: despacho por-litro vs porcentaje, sin units/amount, units/amount=0, respeta tope y min_purchase, sin tipo → 0, unidad ≠ liter cae a porcentaje
- **rankRecommendations**: lista vacía, 1 elemento, sin monto (ordena por %), con monto bajo/alto (CLP real), desempate por %, excluida por minPurchase, todas con savings=0, inmutabilidad; contexto por litros y promos mixtas (litros activan el contexto, desempate por valor bruto)

### `lib/api-client.ts` — 31 tests
- **URLs**: cada endpoint con sus variantes (sin/con params opcionales, cardIds múltiples/único, merchantId presente/ausente, encoding de caracteres especiales), incl. `getTagsFromApi` y el query param `?tags=` de `getMerchantsFromApi`
- **Fecha local vs UTC**: `getRecommendationsFromApi` a las 23:30 → debe producir fecha de hoy, no del día siguiente
- **HTTP errors**: 404 en `getMerchantByIdFromApi` → null; 404/422/500/503 en el resto → `throw Error("API error N")`
- **Reportes**: `createPromoReport` / `updatePromoReport` — construcción del body, `{id, token}` de la respuesta (el token autoriza el PATCH), y degradación a null sin token o con error HTTP

### `lib/rate-limit.ts` — ventana fija en memoria
- **`fixedWindowRateLimit`**: permite hasta `limit` llamadas y bloquea desde `limit+1`; cada `key` se cuenta por separado (no hay cross-talk entre sesiones/IPs); `limit: 0` bloquea desde la primera llamada. Usado con doble llave (sesión + tope duro por IP) por `POST /api/promo-events` (120/min sesión, 480/min IP), `POST /api/promo-reports` (20/min sesión, 60/min IP) y `PATCH /api/promo-reports/[id]` (30/min IP).

### `scripts/schema.sql` — integridad del esquema (`tests/schema.test.ts`)
Asserts basados en `includes()`/parsing de texto sobre el archivo (no requiere DB): existencia de `merchant_tags` y `merchant_tag_map` (join N:N tags↔comercios), `ON DELETE CASCADE` en `merchant_tag_map`, existencia de `promo_reports` con su `CHECK` de `status`/`reason`, `ON DELETE CASCADE` hacia `promotions`, y la columna `token UUID` (capability del PATCH público) con su migración idempotente.

### `lib/standalone.ts` — 14 tests
- **isStandalone**: SSR (window undefined), matchMedia, iOS (navigator.standalone), ambos true, ninguno
- **syncStandaloneCookie**: HTTPS incluye `; secure`, HTTP no; max-age=31536000; path=/; samesite=lax; elimina cookie con max-age=0; no escribe si cookie ya no existe (no-write innecesario); iOS standalone

### `lib/validate.ts` — 100% líneas/ramas/funciones
- **isValidId**: slugs válidos (letras, dígitos, `-`, `_`, `.`), borde en longitudes 1/64/65, espacios y control (`\t`, `\n`), inyección SQL/HTML/XSS, path traversal, URL encoding (`%`), unicode y acentos, emojis
- **areValidIds**: vacío, todos válidos, uno inválido en distintas posiciones, ID vacío, ID largo
- **isValidCardTypes / isValidDaysOfWeek / isNonNegativeIntOrNull / isValidDateOrNull**: validadores de escritura de `promotions` (consumidos por el repo admin; `lib/validate.ts` se duplica ahí)
- **isValidCardIds**: vacío, ids válidos, id inválido, no-string, vacío, no-array, null
- **isValidReportToken**: UUID válido (minúsculas/mayúsculas), id numérico, UUID truncado, null, vacío
- **isValidDiscountConfig** (XOR %/litro): solo %, bordes 1/100, fuera de rango 0/101, solo por-unidad (liter), unidad desconocida, valor 0, sin unidad, decimal, ambos → false, ninguno → false

### `lib/format.ts` — 100% líneas/funciones
- **toISODateLocal**: hora local (bug timezone), padding mes/día, todos los meses
- **formatDayOfWeek / formatDayShort**: todos los días 0-6, longitud exacta de abreviados
- **formatDate**: número de día, nombre del mes, separador `·`
- **formatCLP**: $0, $1, $999 sin separador, $1.000–$5.250.000 con puntos, siempre empieza con `$`
- **daysOfWeekLabel**: vacío/7 días → "Todos los días"; 1 día → nombre completo; 2-6 días → abreviados separados por coma
- **modalityLabel**: both / online / presencial
- **formatDiscount**: porcentaje → "N%"; por-litro → "$N/L"; prioridad litro; unidad desconocida y `discountPerUnit` null → cae a porcentaje

### `lib/analytics.ts` — 100% líneas/ramas/funciones
- **trackEvent**: no-op en SSR y sin Plausible cargado, envía nombre del evento, props opcionales (`undefined` vs `{ props }`), nunca rompe si Plausible lanza
- **events**: cada helper tipado envía el nombre y las props correctas

### `lib/hooks/use-today.ts` — funciones puras al 100%
- **parseDiaParam**: 0-6 válidos, null, fuera de rango (7, -1, 100), no numérico, floats con decimales
- **effectiveDateFor**: mismo día → misma referencia; lunes/domingo/viernes desde sábado; cruce de mes (29 jun → 4 jul); resultado siempre ≥ hoy para todos los días; inmutabilidad del objeto `today`
- El hook `useToday()` (efectos: focus/visibilitychange/setInterval) no se testea: requeriría un renderer de React, contra la política de cero dependencias de testing. Solo se extraen y testean las funciones puras.

## Metodología de aislamiento

**API/red** — `globalThis.fetch` se sobreescribe en `beforeEach` y se restaura en `afterEach`. El mock captura la URL llamada y devuelve el body/status configurado.

**DOM/navegador** — `window` y `document` se salvan y restauran en cada test. `document.cookie` se reemplaza con un objeto con getter/setter que simula el comportamiento real del browser (append, replace, max-age=0 para borrar), permitiendo verificar tanto el valor almacenado como la cadena exacta que se habría enviado al browser.

**Puro** — `recommendations.ts`, `validate.ts`, `format.ts` y las funciones puras de `use-today.ts` no tienen efectos secundarios; no requieren mock.
