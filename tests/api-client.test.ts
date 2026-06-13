import { describe, it, beforeEach, afterEach } from "node:test";
import { strictEqual, deepStrictEqual, rejects } from "node:assert";
import {
  getBanksFromApi,
  getCardsFromApi,
  getCategoriesFromApi,
  getMerchantsFromApi,
  getRecommendationsFromApi,
  getMerchantByIdFromApi,
  getPromotionsForMerchantFromApi,
} from "../lib/api-client.ts";

describe("Cliente de API (api-client)", () => {
  let originalFetch: typeof globalThis.fetch;
  let lastUrl: string | null = null;
  let mockResponseStatus = 200;
  let mockResponseBody: unknown = {};

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    lastUrl = null;
    mockResponseStatus = 200;
    mockResponseBody = {};

    globalThis.fetch = async (url: string | URL | Request) => {
      lastUrl = url.toString();
      return {
        ok: mockResponseStatus >= 200 && mockResponseStatus < 300,
        status: mockResponseStatus,
        json: async () => mockResponseBody,
      } as Response;
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("getBanksFromApi llama al endpoint correcto", async () => {
    mockResponseBody = [{ id: "santander", name: "Santander" }];
    const res = await getBanksFromApi();
    strictEqual(lastUrl, "/api/banks");
    deepStrictEqual(res, [{ id: "santander", name: "Santander" }]);
  });

  it("getCardsFromApi llama con bankId opcional", async () => {
    mockResponseBody = [{ id: "card-1" }];

    // Sin bankId
    await getCardsFromApi();
    strictEqual(lastUrl, "/api/cards");

    // Con bankId
    await getCardsFromApi("santander");
    strictEqual(lastUrl, "/api/cards?bankId=santander");
  });

  it("getCategoriesFromApi llama al endpoint correcto", async () => {
    await getCategoriesFromApi();
    strictEqual(lastUrl, "/api/categories");
  });

  it("getMerchantsFromApi soporta filtros q y category", async () => {
    // Sin filtros
    await getMerchantsFromApi();
    strictEqual(lastUrl, "/api/merchants");

    // Con q
    await getMerchantsFromApi({ q: "jumbo" });
    strictEqual(lastUrl, "/api/merchants?q=jumbo");

    // Con category
    await getMerchantsFromApi({ category: "supermercado" });
    strictEqual(lastUrl, "/api/merchants?category=supermercado");

    // Con ambos
    await getMerchantsFromApi({ q: "lider", category: "supermercado" });
    strictEqual(lastUrl, "/api/merchants?q=lider&category=supermercado");
  });

  it("getRecommendationsFromApi construye query array para cardIds", async () => {
    const params = {
      cardIds: ["santander-credit", "bci-debit"],
      date: new Date(2026, 5, 13), // 13 de junio, 2026
      merchantId: "jumbo",
    };

    await getRecommendationsFromApi(params);
    strictEqual(
      lastUrl,
      "/api/recommendations?cardIds=santander-credit&cardIds=bci-debit&date=2026-06-13&merchantId=jumbo"
    );
  });

  it("getMerchantByIdFromApi maneja 404 retornando null", async () => {
    mockResponseStatus = 404;
    mockResponseBody = null;
    const res = await getMerchantByIdFromApi("non-existent");
    strictEqual(lastUrl, "/api/merchants/non-existent");
    strictEqual(res, null);
  });

  it("getPromotionsForMerchantFromApi escapa caracteres especiales en path", async () => {
    await getPromotionsForMerchantFromApi("mcdonald / spa");
    strictEqual(lastUrl, "/api/promotions/mcdonald%20%2F%20spa");
  });

  it("propaga errores HTTP arrojando un Error", async () => {
    mockResponseStatus = 500;
    await rejects(
      getBanksFromApi(),
      /API error 500/
    );
  });
});
