import { describe, it, beforeEach, afterEach } from "node:test";
import { strictEqual, deepStrictEqual, rejects, ok } from "node:assert";
import {
  getBanksFromApi,
  getCardsFromApi,
  getCategoriesFromApi,
  getTagsFromApi,
  getMerchantsFromApi,
  getRecommendationsFromApi,
  getMerchantByIdFromApi,
  getPromotionsForMerchantFromApi,
  createPromoReport,
  updatePromoReport,
} from "../lib/api-client.ts";

// ──────────────────────── URLs construidas correctamente ─────────────────────

describe("Cliente de API — URLs", () => {
  let originalFetch: typeof globalThis.fetch;
  let lastUrl = "";
  let mockStatus = 200;
  let mockBody: unknown = {};

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    lastUrl = "";
    mockStatus = 200;
    mockBody = {};
    globalThis.fetch = async (url: string | URL | Request) => {
      lastUrl = url.toString();
      return {
        ok: mockStatus >= 200 && mockStatus < 300,
        status: mockStatus,
        json: async () => mockBody,
      } as Response;
    };
  });

  afterEach(() => { globalThis.fetch = originalFetch; });

  // getBanksFromApi
  it("getBanksFromApi -> /api/banks, retorna datos", async () => {
    mockBody = [{ id: "santander", name: "Santander", short_name: null, available: true }];
    const res = await getBanksFromApi();
    strictEqual(lastUrl, "/api/banks");
    deepStrictEqual(res, mockBody);
  });

  // getCardsFromApi
  it("getCardsFromApi sin bankId -> /api/cards", async () => {
    await getCardsFromApi();
    strictEqual(lastUrl, "/api/cards");
  });

  it("getCardsFromApi con bankId -> /api/cards?bankId=...", async () => {
    await getCardsFromApi("santander");
    strictEqual(lastUrl, "/api/cards?bankId=santander");
  });

  // getCategoriesFromApi
  it("getCategoriesFromApi -> /api/categories", async () => {
    await getCategoriesFromApi();
    strictEqual(lastUrl, "/api/categories");
  });

  // getTagsFromApi
  it("getTagsFromApi -> /api/tags", async () => {
    await getTagsFromApi();
    strictEqual(lastUrl, "/api/tags");
  });

  // getMerchantsFromApi
  it("getMerchantsFromApi sin params -> /api/merchants", async () => {
    await getMerchantsFromApi();
    strictEqual(lastUrl, "/api/merchants");
  });

  it("getMerchantsFromApi con q -> ?q=...", async () => {
    await getMerchantsFromApi({ q: "jumbo" });
    strictEqual(lastUrl, "/api/merchants?q=jumbo");
  });

  it("getMerchantsFromApi con category -> ?category=...", async () => {
    await getMerchantsFromApi({ category: "supermercado" });
    strictEqual(lastUrl, "/api/merchants?category=supermercado");
  });

  it("getMerchantsFromApi con q y category -> ambos params", async () => {
    await getMerchantsFromApi({ q: "lider", category: "supermercado" });
    strictEqual(lastUrl, "/api/merchants?q=lider&category=supermercado");
  });

  it("getMerchantsFromApi con tags -> ?tags=a,b (separados por coma)", async () => {
    await getMerchantsFromApi({ tags: ["sushi", "delivery-apps"] });
    strictEqual(lastUrl, "/api/merchants?tags=sushi%2Cdelivery-apps");
  });

  it("getMerchantsFromApi con tags vacío -> NO incluye el param", async () => {
    await getMerchantsFromApi({ tags: [] });
    ok(!lastUrl.includes("tags"), "URL no debe incluir tags cuando la lista está vacía");
  });

  // getRecommendationsFromApi
  it("getRecommendationsFromApi con multiples cardIds -> params repetidos en URL", async () => {
    await getRecommendationsFromApi({
      cardIds: ["santander-credit", "bci-debit"],
      date: new Date(2026, 5, 13),
    });
    strictEqual(lastUrl, "/api/recommendations?cardIds=santander-credit&cardIds=bci-debit&date=2026-06-13");
  });

  it("getRecommendationsFromApi con un solo cardId", async () => {
    await getRecommendationsFromApi({ cardIds: ["card-1"], date: new Date(2026, 5, 13) });
    strictEqual(lastUrl, "/api/recommendations?cardIds=card-1&date=2026-06-13");
  });

  it("getRecommendationsFromApi con merchantId -> incluye param", async () => {
    await getRecommendationsFromApi({ cardIds: ["c-1"], date: new Date(2026, 5, 13), merchantId: "jumbo" });
    strictEqual(lastUrl, "/api/recommendations?cardIds=c-1&date=2026-06-13&merchantId=jumbo");
  });

  it("getRecommendationsFromApi sin merchantId -> NO incluye el param", async () => {
    await getRecommendationsFromApi({ cardIds: ["c-1"], date: new Date(2026, 5, 13) });
    ok(!lastUrl.includes("merchantId"), "URL no debe incluir merchantId");
  });

  it("getRecommendationsFromApi usa fecha LOCAL no UTC (bug timezone)", async () => {
    // 23:30 local en Chile -> toISOString() daria el dia siguiente en UTC
    await getRecommendationsFromApi({ cardIds: ["x"], date: new Date(2026, 5, 13, 23, 30) });
    ok(lastUrl.includes("date=2026-06-13"), "debe ser 2026-06-13, no el dia siguiente");
  });

  // getMerchantByIdFromApi
  it("getMerchantByIdFromApi con 200 -> retorna el comercio", async () => {
    mockBody = { id: "jumbo", name: "Jumbo", category_id: "super", aliases: [], category_label: "Supermercado", emoji: "shopping" };
    const res = await getMerchantByIdFromApi("jumbo");
    strictEqual(lastUrl, "/api/merchants/jumbo");
    deepStrictEqual(res, mockBody);
  });

  it("getMerchantByIdFromApi con 404 -> retorna null sin throw", async () => {
    mockStatus = 404;
    const res = await getMerchantByIdFromApi("no-existe");
    strictEqual(lastUrl, "/api/merchants/no-existe");
    strictEqual(res, null);
  });

  it("getMerchantByIdFromApi encodes caracteres especiales en el ID", async () => {
    await getMerchantByIdFromApi("mcdonald / spa");
    strictEqual(lastUrl, "/api/merchants/mcdonald%20%2F%20spa");
  });

  // getPromotionsForMerchantFromApi
  it("getPromotionsForMerchantFromApi -> /api/promotions/:id", async () => {
    mockBody = [];
    await getPromotionsForMerchantFromApi("jumbo");
    strictEqual(lastUrl, "/api/promotions/jumbo");
  });

  it("getPromotionsForMerchantFromApi encodes caracteres especiales", async () => {
    await getPromotionsForMerchantFromApi("cafe & more");
    strictEqual(lastUrl, "/api/promotions/cafe%20%26%20more");
  });
});

// ──────────────────────────── Errores HTTP ────────────────────────────────────

describe("Cliente de API — errores HTTP", () => {
  let originalFetch: typeof globalThis.fetch;
  let mockStatus = 500;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: false,
      status: mockStatus,
      json: async () => null,
    } as Response);
  });

  afterEach(() => { globalThis.fetch = originalFetch; });

  it("500 en getBanksFromApi -> lanza Error con el codigo", async () => {
    mockStatus = 500;
    await rejects(getBanksFromApi(), /API error 500/);
  });

  it("503 en getCardsFromApi -> lanza Error con el codigo", async () => {
    mockStatus = 503;
    await rejects(getCardsFromApi("bci"), /API error 503/);
  });

  it("422 en getMerchantsFromApi -> lanza Error", async () => {
    mockStatus = 422;
    await rejects(getMerchantsFromApi({ q: "test" }), /API error 422/);
  });

  it("500 en getPromotionsForMerchantFromApi -> lanza Error", async () => {
    mockStatus = 500;
    await rejects(getPromotionsForMerchantFromApi("jumbo"), /API error 500/);
  });

  it("404 en getCardsFromApi -> lanza Error (solo getMerchantById tiene trato especial)", async () => {
    mockStatus = 404;
    await rejects(getCardsFromApi(), /API error 404/);
  });

  it("500 en getMerchantByIdFromApi -> lanza Error (no retorna null)", async () => {
    mockStatus = 500;
    await rejects(getMerchantByIdFromApi("jumbo"), /API error 500/);
  });
});

// ──────────────────────── Reportes de promos ─────────────────────────────────

describe("Cliente de API — reportes de promos", () => {
  let originalFetch: typeof globalThis.fetch;
  let lastUrl = "";
  let mockStatus = 200;
  let mockBody: unknown = {};
  const g = globalThis as unknown as { window?: unknown };

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    lastUrl = "";
    mockStatus = 200;
    mockBody = {};
    // createPromoReport/updatePromoReport son no-ops fuera del navegador; simulamos window.
    g.window = {};
    globalThis.fetch = async (url: string | URL | Request) => {
      lastUrl = url.toString();
      return {
        ok: mockStatus >= 200 && mockStatus < 300,
        status: mockStatus,
        json: async () => mockBody,
      } as Response;
    };
  });

  afterEach(() => { globalThis.fetch = originalFetch; delete g.window; });

  it("createPromoReport -> POST /api/promo-reports y devuelve el id", async () => {
    mockBody = { id: 99 };
    const id = await createPromoReport({ promotionId: "p1", merchantId: "m1", bankId: "b1" });
    strictEqual(lastUrl, "/api/promo-reports");
    strictEqual(id, 99);
  });

  it("createPromoReport con error HTTP -> devuelve null sin lanzar", async () => {
    mockStatus = 500;
    const id = await createPromoReport({ promotionId: "p1", merchantId: "m1", bankId: "b1" });
    strictEqual(id, null);
  });

  it("updatePromoReport -> PATCH /api/promo-reports/:id", () => {
    updatePromoReport(42, "expired");
    strictEqual(lastUrl, "/api/promo-reports/42");
  });
});
