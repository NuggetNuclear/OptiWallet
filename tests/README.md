# Batería de Pruebas Unitarias de OptiWallet

Runner nativo de Node.js (`node:test` + `node:assert`) — sin Jest, sin Vitest, cero dependencias de testing.

## Estructura

```
tests/                          # Suite principal
├── README.md
├── admin-crypto.test.ts        # Cifrado AES-256-GCM de secretos TOTP + fail-closed
├── analytics.test.ts           # Wrapper Plausible: trackEvent + helpers tipados
├── api-client.test.ts          # Wrappers de fetch: URLs, params, códigos HTTP
├── recommendations.test.ts     # Motor de ahorro: savings (%/litro), ranking, stacking
├── schema.test.ts              # Integridad de scripts/schema.sql
├── standalone.test.ts          # Detección PWA standalone + sincronización de cookie
└── validate.test.ts            # Sanitización de IDs + validadores de writes admin

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
- **calculateStackedSavings**: amount=0, promos vacías, una promo, cascada correcta, excluida en remanente, tope en cascada, tope=0, todas excluidas, inmutabilidad, ignora no-apilables, promo por-litro no reduce el monto base

### `lib/api-client.ts` — 22 tests
- **URLs**: cada endpoint con sus variantes (sin/con params opcionales, cardIds múltiples/único, merchantId presente/ausente, encoding de caracteres especiales)
- **Fecha local vs UTC**: `getRecommendationsFromApi` a las 23:30 → debe producir fecha de hoy, no del día siguiente
- **HTTP errors**: 404 en `getMerchantByIdFromApi` → null; 404/422/500/503 en el resto → `throw Error("API error N")`

### `lib/standalone.ts` — 13 tests
- **isStandalone**: SSR (window undefined), matchMedia, iOS (navigator.standalone), ambos true, ninguno
- **syncStandaloneCookie**: HTTPS incluye `; secure`, HTTP no; max-age=31536000; path=/; samesite=lax; elimina cookie con max-age=0; no escribe si cookie ya no existe (no-write innecesario); iOS standalone

### `lib/validate.ts` — 100% líneas/ramas/funciones
- **isValidId**: slugs válidos (letras, dígitos, `-`, `_`, `.`), borde en longitudes 1/64/65, espacios y control (`\t`, `\n`), inyección SQL/HTML/XSS, path traversal, URL encoding (`%`), unicode y acentos, emojis
- **areValidIds**: vacío, todos válidos, uno inválido en distintas posiciones, ID vacío, ID largo
- **isValidCardTypes / isValidDaysOfWeek / isNonNegativeIntOrNull / isValidDateOrNull**: writes del panel admin
- **isValidCardIds**: vacío, ids válidos, id inválido, no-string, vacío, no-array, null
- **isValidDiscountConfig** (XOR %/litro): solo %, bordes 1/100, fuera de rango 0/101, solo por-unidad (liter), unidad desconocida, valor 0, sin unidad, decimal, ambos → false, ninguno → false

### `lib/format.ts` — 100% líneas/funciones
- **toISODateLocal**: hora local (bug timezone), padding mes/día, todos los meses
- **formatDayOfWeek / formatDayShort**: todos los días 0-6, longitud exacta de abreviados
- **formatDate / formatDateShort**: número de día, nombre del mes, separador `·`, 3 letras del mes
- **formatCLP**: $0, $1, $999 sin separador, $1.000–$5.250.000 con puntos, siempre empieza con `$`
- **daysOfWeekLabel**: vacío/7 días → "Todos los días"; 1 día → nombre completo; 2-6 días → abreviados separados por coma
- **modalityLabel**: both / online / presencial
- **formatDiscount**: porcentaje → "N%"; por-litro → "$N/L"; prioridad litro; unidad desconocida y `discountPerUnit` null → cae a porcentaje

### `lib/admin-crypto.ts` — 100% líneas/ramas/funciones
- **encrypt/decrypt**: roundtrip, ciphertext sin plaintext, envoltorio `v1.`, IV no determinista, plaintext legacy intacto, envoltorio malformado, integridad GCM (ciphertext manipulado falla auth)
- **fail-closed**: en proceso fresco sin `ADMIN_TOTP_ENC_KEY`/`ADMIN_SESSION_SECRET`, `encryptSecret` lanza con mensaje claro
- **safeEqual**: comparación en tiempo constante

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

**Subproceso** — el camino fail-closed de `admin-crypto.ts` (sin clave) solo es observable en un proceso nuevo, porque la clave se cachea a nivel de módulo. Se verifica con `execFileSync` lanzando Node sin las env vars y comprobando que `encryptSecret` aborta.
