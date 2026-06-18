import "server-only";
import { embed, generateJSON, aiAvailable, aiProvider } from "./provider";

/**
 * Resolución de comercios asistida por IA.
 *
 * `rankMerchants` — prefiltra con tokens a los 20 candidatos más probables y
 * luego re-rankea con embeddings (coseno). Así solo necesita ~21 requests de
 * embedding por query en vez de embeber el corpus completo (~500 req).
 *
 * `suggestCategory` — una sola llamada generativa elige la categoría más
 * probable. Best-effort: si falla devuelve null.
 *
 * Ambas degradan con gracia si no hay IA: quedan en matching por tokens.
 */

export type MerchantLite = { id: string; name: string; aliases: string[]; category_id?: string };
export type CategoryLite = { id: string; label: string };
export type Suggestion = { id: string; name: string; score: number };

// Si embeddings falla (404, timeout), no reintentamos hasta el próximo reinicio.
let embedUnavailable = false;

const PREFILTER_N = 20; // candidatos por tokens antes de embeber

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

function norm(s: string): string[] {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
}

/** Prefiltra por solape de tokens. Devuelve los top-N candidatos. */
function tokenRank(name: string, merchants: MerchantLite[], n = 5): Suggestion[] {
  const target = new Set(norm(name));
  if (target.size === 0) return [];
  return merchants
    .map((m) => {
      const toks = new Set([...norm(m.name), ...m.aliases.flatMap(norm)]);
      let shared = 0; target.forEach((t) => { if (toks.has(t)) shared++; });
      return { id: m.id, name: m.name, score: shared / target.size };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, n);
}

export type RankResult = { provider: string; candidates: Suggestion[] };

/**
 * Top-5 comercios más parecidos al nombre dado.
 * Flujo: tokens (prefilter top-20) → embeddings (re-rank) → top-5.
 * Si embeddings no está disponible, devuelve directo los top-5 por tokens.
 */
export async function rankMerchants(name: string, merchants: MerchantLite[]): Promise<RankResult> {
  if (!name.trim() || merchants.length === 0) return { provider: "none", candidates: [] };

  // Prefilter por tokens siempre — reduce el corpus antes de llamar a la IA
  const tokenCands = tokenRank(name, merchants, PREFILTER_N);

  if (!aiAvailable() || embedUnavailable || tokenCands.length === 0) {
    return { provider: "tokens", candidates: tokenCands.slice(0, 5) };
  }

  try {
    // Embeber solo los candidatos preseleccionados + la query (~21 requests max)
    const candidateMerchants = tokenCands.map((c) => merchants.find((m) => m.id === c.id)!);
    const texts = [name, ...candidateMerchants.map((m) => [m.name, ...m.aliases].join(" "))];
    const vecs = await embed(texts);
    const [qVec, ...corpusVecs] = vecs;
    const ranked = candidateMerchants
      .map((m, i) => ({ id: m.id, name: m.name, score: cosine(qVec, corpusVecs[i]) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    return { provider: aiProvider(), candidates: ranked };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("HTTP 404") || msg.includes("AbortError")) embedUnavailable = true;
    console.warn("rankMerchants AI falló, fallback a tokens:", msg);
    return { provider: "tokens-fallback", candidates: tokenCands.slice(0, 5) };
  }
}

/** Sugiere el category_id más probable para un comercio nuevo. null si no aplica. */
export async function suggestCategory(name: string, categories: CategoryLite[]): Promise<string | null> {
  if (!aiAvailable() || categories.length === 0) return null;
  try {
    const list = categories.map((c) => `${c.id} = ${c.label}`).join("\n");
    const prompt =
      `Eres un clasificador de comercios chilenos. Dado el nombre de un comercio, ` +
      `elige la categoría MÁS adecuada de la lista. Responde SOLO JSON ` +
      `{"category_id": "<id>"} usando exactamente uno de los ids dados.\n\n` +
      `Comercio: "${name}"\n\nCategorías:\n${list}`;
    const out = await generateJSON<{ category_id?: string }>(prompt);
    const id = out?.category_id;
    return id && categories.some((c) => c.id === id) ? id : null;
  } catch (err) {
    console.warn("suggestCategory falló:", err instanceof Error ? err.message : err);
    return null;
  }
}
