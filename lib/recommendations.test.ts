import { describe, it } from "node:test";
import { strictEqual } from "node:assert";
import { promoAppliesToCard } from "./recommendations.ts";

describe("promoAppliesToCard — matching de tarjeta única", () => {
  const blackBank = { bankId: "bice" };
  const cards = {
    visaGold:      { id: "bice-visa-gold",      bankId: "bice", type: "credit" },
    visaSignature: { id: "bice-visa-signature", bankId: "bice", type: "credit" },
    mcBlack:       { id: "bice-mc-black",        bankId: "bice", type: "credit" },
    debito:        { id: "bice-debito",          bankId: "bice", type: "debit"  },
    otroBanco:     { id: "santander-credit",     bankId: "santander", type: "credit" },
  };

  it("sin card_ids: aplica a todas las tarjetas del banco cuyo type coincide", () => {
    const promo = { ...blackBank, cardTypes: ["credit"], cardIds: [] };
    strictEqual(promoAppliesToCard(promo, cards.visaGold), true);
    strictEqual(promoAppliesToCard(promo, cards.visaSignature), true);
    strictEqual(promoAppliesToCard(promo, cards.mcBlack), true);
  });

  it("sin card_ids: NO aplica a un type distinto (débito) aunque sea del banco", () => {
    const promo = { ...blackBank, cardTypes: ["credit"], cardIds: [] };
    strictEqual(promoAppliesToCard(promo, cards.debito), false);
  });

  it("con card_ids: aplica SOLO a la tarjeta listada (ej. Mastercard Black)", () => {
    const promo = { ...blackBank, cardTypes: ["credit"], cardIds: ["bice-mc-black"] };
    strictEqual(promoAppliesToCard(promo, cards.mcBlack), true);
  });

  it("con card_ids: IGNORA las otras tarjetas de crédito del mismo banco", () => {
    // Este es exactamente el bug reportado: un banco con 3 tarjetas de crédito
    // donde la promo es de una sola. Las otras dos NO deben aplicar.
    const promo = { ...blackBank, cardTypes: ["credit"], cardIds: ["bice-mc-black"] };
    strictEqual(promoAppliesToCard(promo, cards.visaGold), false);
    strictEqual(promoAppliesToCard(promo, cards.visaSignature), false);
  });

  it("nunca aplica a tarjetas de otro banco", () => {
    const sinRestriccion = { ...blackBank, cardTypes: ["credit"], cardIds: [] };
    const conRestriccion = { ...blackBank, cardTypes: ["credit"], cardIds: ["bice-mc-black"] };
    strictEqual(promoAppliesToCard(sinRestriccion, cards.otroBanco), false);
    strictEqual(promoAppliesToCard(conRestriccion, cards.otroBanco), false);
  });

  it("con varias card_ids: aplica a cualquiera de las listadas", () => {
    const promo = { ...blackBank, cardTypes: ["credit"], cardIds: ["bice-mc-black", "bice-visa-gold"] };
    strictEqual(promoAppliesToCard(promo, cards.mcBlack), true);
    strictEqual(promoAppliesToCard(promo, cards.visaGold), true);
    strictEqual(promoAppliesToCard(promo, cards.visaSignature), false);
  });
});
