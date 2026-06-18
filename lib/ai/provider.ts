import "server-only";

/**
 * Capa de IA agnóstica al proveedor.
 *
 * Expone dos primitivas — `embed()` (vectores) y `generateJSON()` (texto→JSON) —
 * con dos backends intercambiables por env var:
 *
 *   AI_PROVIDER=gemini   (default)  → Google AI Studio. Requiere GEMINI_API_KEY.
 *   AI_PROVIDER=ollama              → instancia local (http://localhost:11434).
 *
 * El resto del código (resolver de comercios, futuros parsers de casos borde)
 * importa SOLO estas dos funciones y no sabe qué backend corre detrás. Cambiar
 * de nube a local = cambiar una env var, sin tocar lógica.
 *
 * Modelos configurables (con defaults sensatos). Los nombres de modelo cambian
 * seguido — si un modelo deja de existir, override por env, no hay que tocar
 * código.
 */

const PROVIDER = (process.env.AI_PROVIDER ?? "gemini").toLowerCase();

const GEMINI_KEY   = process.env.GEMINI_API_KEY ?? "";
const GEMINI_EMBED = process.env.GEMINI_EMBED_MODEL ?? "gemini-embedding-2";
const GEMINI_GEN   = process.env.GEMINI_GEN_MODEL ?? "gemini-3.1-flash-lite";

const OLLAMA_URL   = (process.env.OLLAMA_URL ?? "http://localhost:11434").replace(/\/+$/, "");
const OLLAMA_EMBED = process.env.OLLAMA_EMBED_MODEL ?? "nomic-embed-text";
const OLLAMA_GEN   = process.env.OLLAMA_GEN_MODEL ?? "gemma2";

// Groq: OpenAI-compatible API, free tier ~14 400 req/día.
// No tiene modelos de embeddings → embed() lanza, lo que activa el fallback a tokens.
// Set AI_PROVIDER=groq y GROQ_API_KEY=<key>.
const GROQ_KEY = process.env.GROQ_API_KEY ?? "";
const GROQ_GEN = process.env.GROQ_GEN_MODEL ?? "llama-3.1-8b-instant";

const EMBED_BATCH = 96; // límite conservador por request
const AI_TIMEOUT_MS = 8000; // 8 s — falla rápido antes de caer al fallback

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  ms = AI_TIMEOUT_MS,
  maxRetries = 4
): Promise<Response> {
  let attempt = 0;
  while (true) {
    attempt++;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    try {
      const res = await fetch(url, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(timer));
      
      if (res.status === 429 && attempt <= maxRetries) {
        const retryAfterHeader = res.headers.get("retry-after") ?? res.headers.get("x-ratelimit-reset");
        let delayMs = 6000; // 6 segundos por defecto para Groq free tier
        if (retryAfterHeader) {
          const parsed = parseFloat(retryAfterHeader);
          if (!isNaN(parsed)) {
            // Groq o APIs de LLMs pueden responder en segundos
            delayMs = parsed * 1000;
          }
        } else {
          delayMs = attempt * 8000; // backoff progresivo (8s, 16s, 24s...)
        }
        
        // Agregar un pequeño margen extra de seguridad para asegurar que el límite de ventana de Groq se limpie
        delayMs += 500;
        
        console.warn(`[AI Provider] HTTP 429 Rate Limit en ${url}. Reintentando ${attempt}/${maxRetries} en ${Math.round(delayMs)}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
      
      return res;
    } catch (err) {
      if (attempt > maxRetries) throw err;
      const isAbort = err instanceof Error && err.name === "AbortError";
      console.warn(
        `[AI Provider] Intento ${attempt}/${maxRetries} falló (${isAbort ? "Timeout" : "Error de red"}). ` +
        `Reintentando en ${attempt * 2000}ms...`
      );
      await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
    }
  }
}

export function aiProvider(): string {
  return PROVIDER;
}

/** ¿Hay un backend configurado y usable? Gemini/Groq necesitan key; Ollama se asume local. */
export function aiAvailable(): boolean {
  if (PROVIDER === "gemini") return GEMINI_KEY.length > 0 || GROQ_KEY.length > 0;
  if (PROVIDER === "ollama") return true;
  if (PROVIDER === "groq")   return GROQ_KEY.length > 0;
  return false;
}

// ── Embeddings ────────────────────────────────────────────────────────────────

/** Devuelve un vector por texto. Chunkea para respetar límites del proveedor. */
export async function embed(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  if (PROVIDER === "groq") throw new Error("Groq no soporta embeddings — usar fallback por tokens");
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    const chunk = texts.slice(i, i + EMBED_BATCH);
    const vecs = PROVIDER === "ollama" ? await embedOllama(chunk) : await embedGemini(chunk);
    out.push(...vecs);
  }
  return out;
}

async function embedGemini(texts: string[]): Promise<number[][]> {
  // gemini-embedding-* usa embedContent (un texto por request), no batchEmbedContents.
  const results: number[][] = [];
  for (const text of texts) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_EMBED}:embedContent?key=${GEMINI_KEY}`;
    const r = await fetchWithTimeout(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: { parts: [{ text }] } }),
    });
    if (!r.ok) throw new Error(`Gemini embed HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j = await r.json();
    results.push(j.embedding?.values ?? []);
  }
  return results;
}

async function embedOllama(texts: string[]): Promise<number[][]> {
  const r = await fetchWithTimeout(`${OLLAMA_URL}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: OLLAMA_EMBED, input: texts }),
  });
  if (!r.ok) throw new Error(`Ollama embed HTTP ${r.status}`);
  const j = await r.json();
  return j.embeddings as number[][];
}

// ── Generación JSON ───────────────────────────────────────────────────────────

/**
 * Pide al modelo una respuesta JSON y la parsea. `schemaHint` es texto libre que
 * describe la forma esperada (se inyecta en el prompt). Devuelve el objeto
 * parseado o lanza si no se pudo.
 */
export async function generateJSON<T = unknown>(prompt: string): Promise<T> {
  let raw: string;
  if (PROVIDER === "ollama") {
    raw = await genOllama(prompt);
  } else if (PROVIDER === "groq") {
    raw = await genGroq(prompt);
  } else {
    try {
      raw = await genGemini(prompt);
    } catch (err) {
      if (GROQ_KEY.length > 0) {
        console.warn(`[AI Provider] Gemini generation failed. Falling back to Groq... Error:`, err instanceof Error ? err.message : err);
        try {
          raw = await genGroq(prompt);
        } catch (groqErr) {
          console.error(`[AI Provider] Groq fallback also failed:`, groqErr);
          throw err;
        }
      } else {
        throw err;
      }
    }
  }
  return parseLooseJSON<T>(raw);
}

async function genGroq(prompt: string): Promise<string> {
  const r = await fetchWithTimeout("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_GEN,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0,
    }),
  }, 15000); // Groq puede tardar más en la primera llamada
  if (!r.ok) throw new Error(`Groq gen HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  return j?.choices?.[0]?.message?.content ?? "";
}

async function genGemini(prompt: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_GEN}:generateContent?key=${GEMINI_KEY}`;
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: "application/json", temperature: 0 },
  };
  const r = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }, 15000);
  if (!r.ok) throw new Error(`Gemini gen HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  return j?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

async function genOllama(prompt: string): Promise<string> {
  const r = await fetchWithTimeout(`${OLLAMA_URL}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: OLLAMA_GEN, prompt, stream: false, format: "json", options: { temperature: 0 } }),
  }, 30000); // Ollama local puede tardar en la primera inferencia
  if (!r.ok) throw new Error(`Ollama gen HTTP ${r.status}`);
  const j = await r.json();
  return j.response ?? "";
}

/** Parsea JSON tolerando texto alrededor (algunos modelos envuelven en ```json). */
function parseLooseJSON<T>(raw: string): T {
  const trimmed = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const m = trimmed.match(/[{[][\s\S]*[}\]]/);
    if (m) return JSON.parse(m[0]) as T;
    throw new Error("Respuesta del modelo no es JSON válido");
  }
}
