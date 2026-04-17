import {
  getRecommendations,
  getRecommendationsForMerchant,
  computeSavings,
} from "./lib/recommendation-engine";
import { PROMOTIONS } from "./lib/data/promotions";
import { MERCHANTS } from "./lib/data/merchants";
import { CARDS } from "./lib/data/cards";

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("❌ FAIL:", msg);
    process.exit(1);
  } else {
    console.log("✅", msg);
  }
}

// Sanity: toda promo apunta a un merchant que existe
for (const p of PROMOTIONS) {
  const m = MERCHANTS.find((m) => m.id === p.merchantId);
  assert(!!m, `Promo ${p.id} referencia merchant válido (${p.merchantId})`);
}

// Sanity: toda promo tiene discount válido
for (const p of PROMOTIONS) {
  assert(
    p.discount > 0 && p.discount <= 100,
    `Promo ${p.id} tiene discount válido (${p.discount}%)`,
  );
}

// Sanity: cards del documento
assert(CARDS.length === 2, "Hay 2 cards de BCI (crédito + débito)");

// Lunes con BCI crédito → debería ver KFC, Varsovienne, H&CO
const lunes = new Date(2026, 3, 20); // 20 abril 2026 = lunes
const recsLunes = getRecommendations({
  cardIds: ["bci-credit"],
  date: lunes,
});
const merchantsLunes = recsLunes.map((r) => r.merchant.id).sort();
console.log("\nPromos lunes con BCI crédito:", merchantsLunes);
assert(
  merchantsLunes.includes("kfc") && merchantsLunes.includes("varsovienne"),
  "Lunes incluye KFC y Varsovienne",
);
assert(
  merchantsLunes.includes("mi-coca-cola"),
  "Lunes 20-abril incluye promo Mi Coca-Cola (20-26 abril)",
);
assert(
  merchantsLunes.includes("portal-ortodoncia"),
  "Lunes incluye Portal de Ortodoncia (todos los días)",
);

// Débito no debería ver Varsovienne (solo crédito)
const recsDebitoLunes = getRecommendations({
  cardIds: ["bci-debit"],
  date: lunes,
});
const merchantsDebitoLunes = recsDebitoLunes.map((r) => r.merchant.id);
assert(
  !merchantsDebitoLunes.includes("varsovienne"),
  "Débito NO ve Varsovienne (es solo crédito)",
);
assert(
  merchantsDebitoLunes.includes("kfc"),
  "Débito SÍ ve KFC (aplica a crédito y débito)",
);

// Miércoles con BCI crédito debería tener muchas promos
const miercoles = new Date(2026, 3, 22); // 22 abril 2026 = miércoles
const recsMie = getRecommendations({
  cardIds: ["bci-credit"],
  date: miercoles,
});
console.log("\nCantidad de promos miércoles:", recsMie.length);
assert(recsMie.length >= 10, "Miércoles tiene al menos 10 promos con BCI crédito");

// Hoy (17 abril 2026 = viernes). Solo deberían aplicar "todos los días" + 
// fechas especiales que cubren el 17. Ni Coca-Cola (20-26) ni Lipigas (25-29).
const viernes = new Date(2026, 3, 17);
const recsHoy = getRecommendations({
  cardIds: ["bci-credit"],
  date: viernes,
});
const merchantsHoy = recsHoy.map((r) => r.merchant.id).sort();
console.log("\nPromos viernes 17-abril (hoy):", merchantsHoy);
assert(
  !merchantsHoy.includes("mi-coca-cola"),
  "17-abril NO incluye Coca-Cola (empieza 20)",
);
assert(
  !merchantsHoy.includes("lipigas"),
  "17-abril NO incluye Lipigas (empieza 25)",
);
assert(
  merchantsHoy.includes("portal-ortodoncia"),
  "Viernes (sin día específico) incluye Ortodoncia",
);
assert(
  !merchantsHoy.includes("kfc"),
  "Viernes NO incluye KFC (solo lunes)",
);

// Ranking: miércoles, la mejor promo aplicable debería ser Portal Ortodoncia
// (75%) o Papa John's / Juan Valdez / Descorcha (40%)
const winner = recsMie[0];
console.log(
  `\nGanadora miércoles: ${winner.merchant.name} (${winner.promotion.discount}%)`,
);
assert(
  winner.promotion.discount === 75,
  "Top 1 miércoles es Portal Ortodoncia 75%",
);

// Tope funcionando: Varsovienne 40% en $100.000 con tope $20.000 → $20.000
const varsovienne = PROMOTIONS.find((p) => p.id === "bci-varsovienne-lunes")!;
assert(
  computeSavings(varsovienne, 100000) === 20000,
  "Tope de Varsovienne limita a $20.000 en compra de $100k",
);
assert(
  computeSavings(varsovienne, 40000) === 16000,
  "Sin llegar al tope: 40% de $40k = $16k",
);

// Sin tope: KFC 30% en $50k = $15k
const kfc = PROMOTIONS.find((p) => p.id === "bci-kfc-lunes")!;
assert(
  computeSavings(kfc, 50000) === 15000,
  "Sin tope, 30% de $50k = $15k",
);

// Wallet vacía → sin recomendaciones
const empty = getRecommendations({ cardIds: [], date: lunes });
assert(empty.length === 0, "Wallet vacía devuelve array vacío");

// Filtro por merchant
const kfcOnly = getRecommendationsForMerchant("kfc", ["bci-credit"], lunes);
assert(
  kfcOnly.length === 1 && kfcOnly[0].merchant.id === "kfc",
  "Filtro por merchant devuelve solo ese comercio",
);

console.log("\n🎉 Todos los tests pasaron");
