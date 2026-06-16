# Batería de Pruebas Unitarias de OptiWallet

Runner nativo de Node.js (`node:test` + `node:assert`) — sin Jest, sin Vitest, cero dependencias de testing.

## Estructura

```
tests/                          # Suite principal
├── README.md
├── api-client.test.ts          # Wrappers de fetch: URLs, params, códigos HTTP
├── recommendations.test.ts     # Motor de ahorro: savings, ranking, stacking
├── standalone.test.ts          # Detección PWA standalone + sincronización de cookie
└── validate.test.ts            # Sanitización de IDs (slugs, inyección, unicode)

lib/
├── format.test.ts              # Formatters: fechas, días, CLP, modality
└── hooks/use-today.test.ts     # parseDiaParam, effectiveDateFor
```

## Ejecutar

```bash
npm test              # todas las pruebas (lib/**/*.test.ts + tests/**/*.test.ts)
npm run test:watch    # modo observador
node --test tests/validate.test.ts   # un archivo específico
```

## Cobertura por módulo

### `lib/recommendations.ts` — 29 tests
- **calculateSavings**: monto 0/negativo, borde en minPurchase, tope exacto/superado/bajo, descuento 0%/100%, tope=0, redondeo, millones
- **rankRecommendations**: lista vacía, 1 elemento, sin monto (ordena por %), con monto bajo/alto (CLP real), desempate por %, excluida por minPurchase, todas con savings=0, inmutabilidad del array
- **calculateStackedSavings**: amount=0, promos vacías, una promo, cascada correcta, excluida en remanente, tope en cascada, tope=0, todas excluidas, inmutabilidad

### `lib/api-client.ts` — 22 tests
- **URLs**: cada endpoint con sus variantes (sin/con params opcionales, cardIds múltiples/único, merchantId presente/ausente, encoding de caracteres especiales)
- **Fecha local vs UTC**: `getRecommendationsFromApi` a las 23:30 → debe producir fecha de hoy, no del día siguiente
- **HTTP errors**: 404 en `getMerchantByIdFromApi` → null; 404/422/500/503 en el resto → `throw Error("API error N")`

### `lib/standalone.ts` — 13 tests
- **isStandalone**: SSR (window undefined), matchMedia, iOS (navigator.standalone), ambos true, ninguno
- **syncStandaloneCookie**: HTTPS incluye `; secure`, HTTP no; max-age=31536000; path=/; samesite=lax; elimina cookie con max-age=0; no escribe si cookie ya no existe (no-write innecesario); iOS standalone

### `lib/validate.ts` — 35 tests
- **isValidId**: slugs válidos (letras, dígitos, `-`, `_`, `.`), borde en longitudes 1/64/65, espacios y control (`\t`, `\n`), inyección SQL/HTML/XSS, path traversal, URL encoding (`%`), unicode y acentos, emojis
- **areValidIds**: vacío, todos válidos, uno inválido en distintas posiciones, ID vacío, ID largo

### `lib/format.ts` — 30 tests
- **toISODateLocal**: hora local (bug timezone), padding mes/día, todos los meses
- **formatDayOfWeek / formatDayShort**: todos los días 0-6, longitud exacta de abreviados
- **formatDate / formatDateShort**: número de día, nombre del mes, separador `·`, 3 letras del mes
- **formatCLP**: $0, $1, $999 sin separador, $1.000–$5.250.000 con puntos, siempre empieza con `$`
- **daysOfWeekLabel**: vacío/7 días → "Todos los días"; 1 día → nombre completo; 2-6 días → abreviados separados por coma
- **modalityLabel**: both / online / presencial

### `lib/hooks/use-today.ts` — 14 tests
- **parseDiaParam**: 0-6 válidos, null, fuera de rango (7, -1, 100), no numérico, floats con decimales
- **effectiveDateFor**: mismo día → misma referencia; lunes/domingo/viernes desde sábado; cruce de mes (29 jun → 4 jul); resultado siempre ≥ hoy para todos los días; inmutabilidad del objeto `today`

## Metodología de aislamiento

**API/red** — `globalThis.fetch` se sobreescribe en `beforeEach` y se restaura en `afterEach`. El mock captura la URL llamada y devuelve el body/status configurado.

**DOM/navegador** — `window` y `document` se salvan y restauran en cada test. `document.cookie` se reemplaza con un objeto con getter/setter que simula el comportamiento real del browser (append, replace, max-age=0 para borrar), permitiendo verificar tanto el valor almacenado como la cadena exacta que se habría enviado al browser.

**Puro** — `recommendations.ts`, `validate.ts`, `format.ts` y `use-today.ts` son funciones puras sin efectos secundarios; no requieren mock.
