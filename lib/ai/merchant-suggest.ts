import "server-only";
import { embed, generateJSON, aiAvailable, aiProvider } from "./provider";

/**
 * Resolución de comercios asistida por IA.
 *
 * `rankMerchants` — el trabajo principal es MATCHING, no generación: embebemos
 * los nombres de los ~500 comercios existentes una vez (cache), embebemos el
 * nombre scrapeado y rankeamos por similitud coseno. Rápido, barato, estable.
 *
 * `suggestCategory` — para crear un comercio nuevo, una sola llamada generativa
 * elige la categoría más probable de la lista. Best-effort: si falla, null.
 *
 * Ambas degradan con gracia: si no hay backend de IA (sin GEMINI_API_KEY, Ollama
 * caído), `rankMerchants` cae a matching por tokens para que la UI nunca se
 * quede sin sugerencias.
 */

export type MerchantLite = { id: string; name: string; aliases: string[]; category_id?: string };
export type CategoryLite = { id: string; label: string };
export type Suggestion = { id: string; name: string; score: number };

// ── Cache de embeddings del corpus (módulo, vive lo que viva el server) ────────
let cache: { key: string; ids: string[]; vecs: number[][] } | null = null;

function corpusKey(merchants: MerchantLite[]): string {
  // Cambia si cambia el conjunto de comercios → invalida la cache.
  return `${merchants.length}:${merchants.map((m) => m.id).join(",")}`;
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

function norm(s: string): string[] {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
}

/** Fallback determinista por solape de tokens (sin IA). */
function tokenRank(name: string, merchants: MerchantLite[]): Suggestion[] {
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
    .slice(0, 5);
}

export type RankResult = { provider: string; candidates: Suggestion[] };

/** Top-5 comercios existentes más parecidos al nombre dado. */
export async function rankMerchants(name: string, merchants: MerchantLite[]): Promise<RankResult> {
  if (!name.trim() || merchants.length === 0) return { provider: "none", candidates: [] };

  if (!aiAvailable()) {
    return { provider: "tokens", candidates: tokenRank(name, merchants) };
  }

  try {
    const key = corpusKey(merchants);
    if (!cache || cache.key !== key) {
      const vecs = await embed(merchants.map((m) =>
        [m.name, ...m.aliases].join(" ")
      ));
      cache = { key, ids: merchants.map((m) => m.id), vecs };
    }
    const [q] = await embed([name]);
    const byId = new Map(merchants.map((m) => [m.id, m]));
    const ranked = cache.ids
      .map((id, i) => ({ id, name: byId.get(id)?.name ?? id, score: cosine(q, cache!.vecs[i]) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    return { provider: aiProvider(), candidates: ranked };
  } catch (err) {
    console.warn("rankMerchants AI falló, fallback a tokens:", err instanceof Error ? err.message : err);
    return { provider: "tokens-fallback", candidates: tokenRank(name, merchants) };
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
