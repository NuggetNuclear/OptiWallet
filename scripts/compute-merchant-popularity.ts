/**
 * compute-merchant-popularity.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Bootstrappea la popularidad de cada comercio a partir de Google Places (New),
 * para alimentar el cold-start del ranking de promociones cuando OptiWallet aún
 * no tiene tráfico propio.
 *
 * Por cada merchant de la DB:
 *   1. Llama a Places API (New) places:searchText con el nombre + alias, sesgado
 *      a Chile (regionCode CL, languageCode es-CL).
 *   2. Agrega sobre las sucursales devueltas: suma de reseñas (footprint),
 *      rating promedio ponderado por reseñas, y # de sucursales.
 *   3. Normaliza esas señales (min-max sobre el batch, en escala log) a un
 *      `popularity_prior` ∈ [0,1] y deriva un `merchant_tier` ∈ {1..5}.
 *   4. Escribe señales crudas + prior + tier en la tabla merchants.
 *
 * Diseño:
 *   - Las señales crudas se guardan para poder re-tunear PESOS sin re-consultar
 *     la API (cuesta plata por request).
 *   - El prior es relativo AL BATCH: refleja "qué tan popular es este comercio
 *     vs. los otros del catálogo", que es justo lo que el ranking necesita.
 *
 * Uso:
 *   npm run popularity:compute            # consulta Places y ESCRIBE en la DB
 *   npm run popularity:compute -- --dry-run   # consulta pero NO escribe (imprime tabla)
 *
 * Requiere en el entorno:
 *   DATABASE_URL            (Neon)
 *   GOOGLE_PLACES_API_KEY   (GCP → habilitar "Places API (New)")
 */
import { neon } from "@neondatabase/serverless";

// ── Configuración / pesos del prior ──────────────────────────────────────────
// Tuneables sin tocar la lógica. Suman 1.0.
const WEIGHTS = {
  reviews: 0.65, // footprint total (cuánta gente pasa por la marca)
  branches: 0.2, // # de sucursales (qué tan masiva/extendida es)
  rating: 0.15, // calidad percibida
};

// Cuántas páginas de resultados pedir a Places (20 por página, máx 3 → 60).
// Más páginas = mejor estimación de footprint para cadenas grandes, más costo.
const MAX_PAGES = 3;

// Pausa entre comercios para ser amable con la cuota (ms).
const THROTTLE_MS = 250;

const PLACES_ENDPOINT = "https://places.googleapis.com/v1/places:searchText";

// Solo pedimos los campos que usamos (field masking abarata el request).
const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.rating",
  "places.userRatingCount",
  "nextPageToken",
].join(",");

const DRY_RUN = process.argv.includes("--dry-run");

// ── Tipos ────────────────────────────────────────────────────────────────────
interface MerchantRow {
  id: string;
  name: string;
  aliases: string[];
}

interface PlacesPlace {
  id?: string;
  displayName?: { text?: string };
  rating?: number;
  userRatingCount?: number;
}

interface PlacesResponse {
  places?: PlacesPlace[];
  nextPageToken?: string;
}

interface Signals {
  merchant: MerchantRow;
  ratingsTotal: number; // Σ reseñas sobre las sucursales encontradas
  branches: number; // # de sucursales encontradas
  ratingAvg: number | null; // rating promedio ponderado por reseñas
}

interface Scored extends Signals {
  prior: number; // 0–1
  tier: number; // 1–5
}

// ── Guardas de entorno ───────────────────────────────────────────────────────
if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL no está definida.");
  process.exit(1);
}
const API_KEY = process.env.GOOGLE_PLACES_API_KEY;
if (!API_KEY) {
  console.error(
    "❌ GOOGLE_PLACES_API_KEY no está definida. Habilita 'Places API (New)' en GCP y agrega la clave al .env.",
  );
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

// ── Places API (New) ─────────────────────────────────────────────────────────
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Busca un comercio en Places (New) y agrega las señales sobre sus sucursales
 * en Chile. Pagina hasta MAX_PAGES. Tolera errores por-comercio (devuelve ceros)
 * para no abortar todo el batch por una sola marca.
 */
async function fetchSignals(merchant: MerchantRow): Promise<Signals> {
  // El nombre principal manda; los alias ayudan en marcas con nombre ambiguo.
  const textQuery = `${merchant.name} Chile`;

  let ratingsTotal = 0;
  let branches = 0;
  let weightedRatingSum = 0; // Σ (rating_i × reseñas_i) para promedio ponderado
  let pageToken: string | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    const body: Record<string, unknown> = {
      textQuery,
      regionCode: "CL",
      languageCode: "es-CL",
    };
    if (pageToken) body.pageToken = pageToken;

    let res: Response;
    try {
      res = await fetch(PLACES_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": API_KEY as string,
          "X-Goog-FieldMask": FIELD_MASK,
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      console.warn(`  ⚠️  ${merchant.name}: error de red (${String(err)}). Se omite.`);
      break;
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.warn(`  ⚠️  ${merchant.name}: Places respondió ${res.status}. ${detail.slice(0, 200)}`);
      break;
    }

    const data = (await res.json()) as PlacesResponse;
    const places = data.places ?? [];

    for (const p of places) {
      const count = p.userRatingCount ?? 0;
      branches += 1;
      ratingsTotal += count;
      if (typeof p.rating === "number" && count > 0) {
        weightedRatingSum += p.rating * count;
      }
    }

    if (!data.nextPageToken || places.length === 0) break;
    pageToken = data.nextPageToken;
    // El nextPageToken de Places tarda un instante en activarse.
    await sleep(2000);
  }

  const ratingAvg = ratingsTotal > 0 ? weightedRatingSum / ratingsTotal : null;
  return { merchant, ratingsTotal, branches, ratingAvg };
}

// ── Normalización → prior → tier ─────────────────────────────────────────────
/**
 * Convierte las señales crudas del batch en un prior relativo ∈ [0,1].
 *
 *   - reviews y branches se comprimen con log10(1+x) (una cadena gigante no debe
 *     aplastar a todo el resto de forma lineal) y luego se min-max-normalizan
 *     SOBRE EL BATCH.
 *   - rating se reescala: <3.0 → 0, 5.0 → 1 (un rating bajo no aporta prior).
 *   - prior = Σ pesos · señales_normalizadas.
 *
 * El tier sale de cortar [0,1] en 5 buckets iguales (1..5).
 */
function scoreBatch(signals: Signals[]): Scored[] {
  const logReviews = signals.map((s) => Math.log10(1 + s.ratingsTotal));
  const logBranches = signals.map((s) => Math.log10(1 + s.branches));

  const norm = (vals: number[]) => {
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const span = max - min;
    // Si todos son iguales, neutro 0.5 para no inventar diferencias.
    return vals.map((v) => (span === 0 ? 0.5 : (v - min) / span));
  };

  const nReviews = norm(logReviews);
  const nBranches = norm(logBranches);

  return signals.map((s, i) => {
    const ratingFactor =
      s.ratingAvg === null ? 0 : Math.min(1, Math.max(0, (s.ratingAvg - 3.0) / 2.0));

    const prior =
      WEIGHTS.reviews * nReviews[i] +
      WEIGHTS.branches * nBranches[i] +
      WEIGHTS.rating * ratingFactor;

    const clamped = Math.min(1, Math.max(0, prior));
    const tier = Math.min(5, Math.max(1, Math.ceil(clamped * 5) || 1));

    return { ...s, prior: clamped, tier };
  });
}

// ── Persistencia ─────────────────────────────────────────────────────────────
async function persist(scored: Scored[]) {
  for (const s of scored) {
    await sql`
      UPDATE merchants SET
        places_rating         = ${s.ratingAvg},
        places_ratings_total  = ${s.ratingsTotal},
        places_branches       = ${s.branches},
        popularity_prior      = ${s.prior},
        merchant_tier         = ${s.tier},
        popularity_updated_at = now()
      WHERE id = ${s.merchant.id}
    `;
  }
}

// ── Reporte en consola ───────────────────────────────────────────────────────
function printTable(scored: Scored[]) {
  const sorted = [...scored].sort((a, b) => b.prior - a.prior);
  console.log("\n📊 Popularidad calculada (orden descendente):\n");
  console.log(
    "  " +
      "comercio".padEnd(22) +
      "reseñas".padStart(10) +
      "suc.".padStart(6) +
      "rating".padStart(8) +
      "prior".padStart(8) +
      "tier".padStart(6),
  );
  for (const s of sorted) {
    console.log(
      "  " +
        s.merchant.name.padEnd(22) +
        String(s.ratingsTotal).padStart(10) +
        String(s.branches).padStart(6) +
        (s.ratingAvg === null ? "—" : s.ratingAvg.toFixed(2)).padStart(8) +
        s.prior.toFixed(3).padStart(8) +
        String(s.tier).padStart(6),
    );
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`🚀 compute-merchant-popularity ${DRY_RUN ? "(DRY-RUN, no escribe)" : ""}`);

  const merchants = (await sql`
    SELECT id, name, aliases FROM merchants ORDER BY id
  `) as MerchantRow[];

  if (merchants.length === 0) {
    console.log("No hay comercios en la DB. ¿Corriste db:seed?");
    return;
  }
  console.log(`📋 ${merchants.length} comercios. Consultando Places...`);

  const signals: Signals[] = [];
  for (const m of merchants) {
    const s = await fetchSignals(m);
    console.log(
      `  ✓ ${m.name.padEnd(20)} reseñas=${s.ratingsTotal}  sucursales=${s.branches}  rating=${
        s.ratingAvg?.toFixed(2) ?? "—"
      }`,
    );
    signals.push(s);
    await sleep(THROTTLE_MS);
  }

  const scored = scoreBatch(signals);
  printTable(scored);

  if (DRY_RUN) {
    console.log("\n🟡 DRY-RUN: no se escribió nada en la DB.");
    return;
  }

  await persist(scored);
  console.log(`\n✅ Actualizados ${scored.length} comercios en la DB.`);
}

main().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});
