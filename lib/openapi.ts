// lib/openapi.ts — Spec OpenAPI 3.1 de la API pública de OptiWallet (US-003).
// Mantenida a mano: la API es chica y estable; un generador agregaría más
// dependencias que valor. Si agregas/cambias un endpoint, actualiza esto.
// Se sirve en /api/openapi.json y se visualiza con Swagger UI en /api-docs.

const cacheNote =
  "Respuesta cacheada en CDN (s-maxage + stale-while-revalidate).";

export const openApiSpec = {
  openapi: "3.1.0",
  info: {
    title: "OptiWallet API",
    version: "0.1.0-beta",
    description:
      "API pública de solo lectura de OptiWallet: bancos, tarjetas, comercios, " +
      "promociones y el motor de recomendaciones. Sin autenticación — no maneja " +
      "datos personales ni bancarios. Todas las respuestas son JSON.",
    contact: { name: "OptiWallet", url: "https://optiwallet.vercel.app" },
  },
  servers: [
    { url: "https://optiwallet.vercel.app", description: "Producción" },
    { url: "http://localhost:3000", description: "Desarrollo local" },
  ],
  tags: [
    { name: "Catálogo", description: "Bancos, tarjetas, categorías y comercios" },
    { name: "Promociones", description: "Promos activas por comercio" },
    { name: "Recomendaciones", description: "Motor de recomendación por wallet, fecha y comercio" },
    { name: "Meta", description: "Estadísticas públicas del dataset" },
  ],
  paths: {
    "/api/banks": {
      get: {
        tags: ["Catálogo"],
        summary: "Lista de bancos y emisores",
        description: `Bancos ordenados por disponibilidad y nombre. ${cacheNote}`,
        operationId: "getBanks",
        responses: {
          "200": {
            description: "Lista de bancos",
            content: {
              "application/json": {
                schema: { type: "array", items: { $ref: "#/components/schemas/Bank" } },
              },
            },
          },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },
    "/api/cards": {
      get: {
        tags: ["Catálogo"],
        summary: "Lista de tarjetas",
        description: `Todas las tarjetas, opcionalmente filtradas por banco. ${cacheNote}`,
        operationId: "getCards",
        parameters: [
          {
            name: "bankId",
            in: "query",
            required: false,
            description: "Filtra por ID de banco",
            schema: { $ref: "#/components/schemas/Id" },
          },
        ],
        responses: {
          "200": {
            description: "Lista de tarjetas",
            content: {
              "application/json": {
                schema: { type: "array", items: { $ref: "#/components/schemas/Card" } },
              },
            },
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },
    "/api/categories": {
      get: {
        tags: ["Catálogo"],
        summary: "Categorías de comercios",
        description: `Categorías con conteo de comercios. ${cacheNote}`,
        operationId: "getCategories",
        responses: {
          "200": {
            description: "Lista de categorías",
            content: {
              "application/json": {
                schema: { type: "array", items: { $ref: "#/components/schemas/Category" } },
              },
            },
          },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },
    "/api/merchants": {
      get: {
        tags: ["Catálogo"],
        summary: "Buscar comercios",
        description:
          "Búsqueda por nombre o alias (case-insensitive, máx. 50 resultados), " +
          `con filtro opcional por categoría. ${cacheNote}`,
        operationId: "searchMerchants",
        parameters: [
          {
            name: "q",
            in: "query",
            required: false,
            description: "Texto de búsqueda (máx. 80 caracteres)",
            schema: { type: "string", maxLength: 80 },
          },
          {
            name: "category",
            in: "query",
            required: false,
            description: "Filtra por ID de categoría",
            schema: { $ref: "#/components/schemas/Id" },
          },
        ],
        responses: {
          "200": {
            description: "Comercios encontrados",
            content: {
              "application/json": {
                schema: { type: "array", items: { $ref: "#/components/schemas/Merchant" } },
              },
            },
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },
    "/api/merchants/{merchantId}": {
      get: {
        tags: ["Catálogo"],
        summary: "Detalle de un comercio",
        operationId: "getMerchant",
        parameters: [{ $ref: "#/components/parameters/MerchantId" }],
        responses: {
          "200": {
            description: "Comercio",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/Merchant" } },
            },
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "404": {
            description: "Comercio no encontrado (body: null)",
            content: { "application/json": { schema: { type: "null" } } },
          },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },
    "/api/promotions/{merchantId}": {
      get: {
        tags: ["Promociones"],
        summary: "Promos activas y vigentes de un comercio",
        description: `Todas las promociones activas del comercio con fecha de término no vencida, ordenadas por descuento. ${cacheNote}`,
        operationId: "getPromotionsForMerchant",
        parameters: [{ $ref: "#/components/parameters/MerchantId" }],
        responses: {
          "200": {
            description: "Promociones activas",
            content: {
              "application/json": {
                schema: { type: "array", items: { $ref: "#/components/schemas/Promotion" } },
              },
            },
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },
    "/api/recommendations": {
      get: {
        tags: ["Recomendaciones"],
        summary: "Recomendaciones para una wallet",
        description:
          "Cruza las tarjetas de la wallet con las promos vigentes para la fecha " +
          "(día de semana + rango de vigencia), opcionalmente filtrado por comercio. " +
          "Ordenado por descuento descendente: el primer elemento es la mejor opción. " +
          "Sin `cardIds` devuelve `[]`.",
        operationId: "getRecommendations",
        parameters: [
          {
            name: "cardIds",
            in: "query",
            required: true,
            description: "IDs de tarjetas de la wallet (repetible, máx. 100)",
            schema: {
              type: "array",
              maxItems: 100,
              items: { $ref: "#/components/schemas/Id" },
            },
            style: "form",
            explode: true,
          },
          {
            name: "date",
            in: "query",
            required: false,
            description: "Fecha YYYY-MM-DD. Default: hoy en America/Santiago.",
            schema: { type: "string", format: "date", example: "2026-06-12" },
          },
          {
            name: "merchantId",
            in: "query",
            required: false,
            description: "Limita las recomendaciones a un comercio",
            schema: { $ref: "#/components/schemas/Id" },
          },
        ],
        responses: {
          "200": {
            description: "Recomendaciones aplicables, mejor primero",
            content: {
              "application/json": {
                schema: { type: "array", items: { $ref: "#/components/schemas/Recommendation" } },
              },
            },
          },
          "400": { $ref: "#/components/responses/BadRequest" },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },
    "/api/stats": {
      get: {
        tags: ["Meta"],
        summary: "Estadísticas públicas",
        description: `Conteos del dataset para la landing. ${cacheNote}`,
        operationId: "getStats",
        responses: {
          "200": {
            description: "Conteos",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/Stats" } },
            },
          },
          "500": { $ref: "#/components/responses/InternalError" },
        },
      },
    },
  },
  components: {
    parameters: {
      MerchantId: {
        name: "merchantId",
        in: "path",
        required: true,
        description: "ID del comercio",
        schema: { $ref: "#/components/schemas/Id" },
      },
    },
    responses: {
      BadRequest: {
        description: "Parámetros inválidos",
        content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
      },
      InternalError: {
        description: "Error interno",
        content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
      },
    },
    schemas: {
      Id: {
        type: "string",
        description: "Identificador slug (letras, números, guión, guión bajo y punto)",
        pattern: "^[A-Za-z0-9_.-]{1,64}$",
        example: "jumbo",
      },
      Error: {
        type: "object",
        properties: { error: { type: "string", example: "Error interno" } },
        required: ["error"],
      },
      Bank: {
        type: "object",
        properties: {
          id: { $ref: "#/components/schemas/Id" },
          name: { type: "string", example: "Banco de Chile" },
          short_name: { type: ["string", "null"], example: "BChile" },
          available: { type: "boolean", description: "Si ya está integrado o es 'próximamente'" },
        },
        required: ["id", "name", "short_name", "available"],
      },
      Card: {
        type: "object",
        properties: {
          id: { $ref: "#/components/schemas/Id" },
          bank_id: { $ref: "#/components/schemas/Id" },
          name: { type: "string", example: "Mastercard Black" },
          type: { type: "string", enum: ["credit", "debit", "prepaid"] },
        },
        required: ["id", "bank_id", "name", "type"],
      },
      Category: {
        type: "object",
        properties: {
          id: { $ref: "#/components/schemas/Id" },
          label: { type: "string", example: "Supermercados" },
          emoji: { type: "string", example: "🛒" },
          merchant_count: { type: "integer", example: 12 },
        },
        required: ["id", "label", "emoji", "merchant_count"],
      },
      Merchant: {
        type: "object",
        properties: {
          id: { $ref: "#/components/schemas/Id" },
          name: { type: "string", example: "Jumbo" },
          category_id: { $ref: "#/components/schemas/Id" },
          aliases: { type: "array", items: { type: "string" }, example: ["jumbo.cl"] },
          category_label: { type: "string", example: "Supermercados" },
          emoji: { type: "string", example: "🛒" },
        },
        required: ["id", "name", "category_id", "aliases", "category_label", "emoji"],
      },
      Promotion: {
        type: "object",
        properties: {
          id: { $ref: "#/components/schemas/Id" },
          bank_id: { $ref: "#/components/schemas/Id" },
          card_types: {
            type: "array",
            items: { type: "string", enum: ["credit", "debit", "prepaid"] },
          },
          merchant_id: { $ref: "#/components/schemas/Id" },
          discount: { type: "number", description: "Porcentaje de descuento", example: 25 },
          cap: { type: ["number", "null"], description: "Tope en CLP", example: 12500 },
          min_purchase: { type: ["number", "null"], description: "Monto mínimo de compra en CLP", example: 10000 },
          days_of_week: {
            type: "array",
            items: { type: "integer", minimum: 0, maximum: 6 },
            description: "Días aplicables (0=domingo). Vacío = todos los días.",
          },
          start_date: { type: ["string", "null"], format: "date-time" },
          end_date: { type: ["string", "null"], format: "date-time" },
          modality: { type: "string", enum: ["presencial", "online", "both"] },
          code: { type: ["string", "null"], description: "Código promocional si aplica" },
          conditions: { type: ["string", "null"] },
          source: { type: "string", description: "Canal oficial de origen de la promo" },
          verified_at: { type: "string", format: "date-time" },
          active: { type: "boolean" },
          bank_name: { type: "string", example: "Scotiabank" },
        },
        required: [
          "id", "bank_id", "card_types", "merchant_id", "discount", "cap", "min_purchase",
          "days_of_week", "start_date", "end_date", "modality", "code",
          "conditions", "source", "verified_at", "active", "bank_name",
        ],
      },
      Recommendation: {
        type: "object",
        description: "Promo aplicable a una tarjeta de la wallet, con datos denormalizados",
        properties: {
          promotion_id: { $ref: "#/components/schemas/Id" },
          discount: { type: "number", example: 25 },
          cap: { type: ["number", "null"], example: 12500 },
          min_purchase: { type: ["number", "null"], example: 10000 },
          days_of_week: { type: "array", items: { type: "integer", minimum: 0, maximum: 6 } },
          start_date: { type: ["string", "null"], format: "date-time" },
          end_date: { type: ["string", "null"], format: "date-time" },
          modality: { type: "string", enum: ["presencial", "online", "both"] },
          code: { type: ["string", "null"] },
          conditions: { type: ["string", "null"] },
          source: { type: "string" },
          verified_at: { type: "string", format: "date-time" },
          merchant_id: { $ref: "#/components/schemas/Id" },
          merchant_name: { type: "string", example: "Jumbo" },
          category_id: { $ref: "#/components/schemas/Id" },
          category_label: { type: "string", example: "Supermercados" },
          emoji: { type: "string", example: "🛒" },
          card_id: { $ref: "#/components/schemas/Id" },
          card_name: { type: "string", example: "Mastercard Black" },
          card_type: { type: "string", enum: ["credit", "debit", "prepaid"] },
          bank_id: { $ref: "#/components/schemas/Id" },
        },
        required: [
          "promotion_id", "discount", "cap", "min_purchase", "days_of_week", "start_date",
          "end_date", "modality", "code", "conditions", "source", "verified_at",
          "merchant_id", "merchant_name", "category_id", "category_label",
          "emoji", "card_id", "card_name", "card_type", "bank_id",
        ],
      },
      Stats: {
        type: "object",
        properties: {
          promotions: { type: "integer", description: "Promos activas", example: 120 },
          merchants: { type: "integer", example: 85 },
          banks: { type: "integer", example: 14 },
        },
        required: ["promotions", "merchants", "banks"],
      },
    },
  },
} as const;
