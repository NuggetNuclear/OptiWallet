# Batería de Pruebas Unitarias de OptiWallet

Este directorio contiene las pruebas unitarias principales del proyecto. Para simplificar la arquitectura, las pruebas corren sobre el runner nativo de Node.js (`node:test`) y la biblioteca nativa de aserciones (`node:assert`), eliminando cualquier dependencia de frameworks pesados de testing (como Jest o Vitest).

## Estructura de Pruebas

```
tests/
├── README.md               # Este documento
├── api-client.test.ts      # Pruebas unitarias de wrappers de API y fetch
├── recommendations.test.ts # Pruebas del motor de ahorro, excluyentes y apilables
├── standalone.test.ts      # Pruebas de detección de PWA standalone y cookies
└── validate.test.ts        # Pruebas de desinfección y formato de IDs
```

*Nota: Los tests históricos de formato y zona horaria residen en `lib/format.test.ts` y `lib/hooks/use-today.test.ts` para mantenerse colocados con sus respectivos archivos.*

## Cómo Ejecutar los Tests

Puedes correr los tests utilizando npm en la raíz del proyecto:

```bash
# Correr todas las pruebas (en lib/ y tests/)
npm test

# Correr las pruebas en modo observador (watch)
npm run test:watch

# Correr un archivo de prueba específico directamente
node --test tests/validate.test.ts
```

## Metodología de Pruebas

Para mantener los tests rápidos (menos de 250 ms en total) y 100% aislados (sin necesidad de conectarse a Neon PostgreSQL ni requerir un navegador web real), se aplican las siguientes técnicas de simulación (mocking):

### 1. Mocking de API y Red (`api-client.test.ts`)
Interceptamos las llamadas globales a `fetch` sobreescribiendo temporalmente `globalThis.fetch`. Esto nos permite:
* Validar que la API construye la query de URLs correctas (por ejemplo, parámetros repetidos de `cardIds[]` y formato de fechas).
* Probar el comportamiento del cliente frente a diferentes códigos de estado HTTP (200, 404, 500).

### 2. Emulación del Entorno DOM y del Navegador (`standalone.test.ts`)
Módulos como `lib/standalone.ts` dependen de las variables globales `window` y `document`. Para testearlos de forma segura sin un headless browser:
* Definimos mocks locales del objeto global `window` antes de cada test (como `matchMedia` e `iosStandalone`).
* Implementamos getters y setters reactivos en un objeto simulado `document.cookie` para verificar la escritura y expiración de cookies.
* Limpiamos las variables globales simuladas en el callback `afterEach` para evitar efectos colaterales en otras pruebas.
