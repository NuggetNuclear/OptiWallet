#!/usr/bin/env node
// @ts-check
/**
 * Adapter de scraping — Banco de Chile (incluye Banco Edwards).
 *
 * HALLAZGO CLAVE: la página de beneficios es un CMS headless con un API JSON
 * público y paginado. NO hace falta Playwright ni scrapear páginas de detalle:
 * el detalle completo de cada beneficio viene embebido en el listado.
 *
 *   GET /api/content/spaces/personas/types/{type}/entries?page=N&per_page=100
 *   types: "beneficios" (~786), "beneficios-prioridad" (curaduria, ignorar),
 *          "promociones" (~10, campanas del mes con otra forma — aparte)
 *
 * GOTCHA ANTI-BOT: el dominio esta detras de Imperva/Incapsula. Un fetch desde
 * datacenter/CI recibe 307 cookie-challenge y luego 403 con reto JS. Opciones:
 *   1) Correr desde IP residencial (suele pasar el challenge simple).
 *   2) Pasar una cookie valida de un navegador real:  BCH_COOKIE="visid_incap_...; incap_ses_..."
 *   3) Hacer el fetch dentro de un navegador y pasar el JSON a parseEntries().
 *
 * Este script NO toca la DB. Emite a out/:
 *   banco-chile.clean.json   matchearon limpio
 *   banco-chile.edges.json   casos borde agrupados por tipo (revision manual)
 *   banco-chile.import.json  combinado para subir a /admin/ops/import
 *
 * El LLM NO se usa aca: todo es determinista (regex + mapas).
 *
 * Uso:  node scripts/scrapers/banco-chile.mjs
 */

import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "out");
const COOKIE_FILE = join(__dirname, ".bch-cookie.txt");
const BASE =
  "https://sitiospublicos.bancochile.cl/api/content/spaces/personas/types";
const BANK_ID = "banco-chile";

// ── Mapas / catalogos ─────────────────────────────────────────────────────────
// Dias: el CMS pone el dia como tag en meta.tags (junto con ciudades).
const DAYS = {
  domingo: 0, lunes: 1, martes: 2, miercoles: 3, "miércoles": 3,
  jueves: 4, viernes: 5, sabado: 6, "sábado": 6,
};

// Merchant matching. Reemplazar/ampliar con la tabla `merchants` real
// (id + aliases). Hoy el seed solo trae 5 comercios de juguete, casi todo
// caera como "NEW:<slug>" para creacion/dedup manual.
const KNOWN_MERCHANTS = {
  jumbo: "jumbo", lider: "lider", "mcdonald's": "mcdonalds",
  mcdonalds: "mcdonalds", copec: "copec", "juan valdez": "juan-valdez",
};

const CMS_TO_DB_CARD = {
  "visa-credito-infinite": "bchile-visa-credito-infinite",
  "visa-credito-signature": "bchile-visa-credito-signature",
  "visa-credito-platinum": "bchile-visa-credito-platinum",
  "visa-fan-credito": "bchile-visa-fan-credito",
  "visa-debito-bch": "bchile-visa-debito-bch",
  "visa-cuenta-fan": "bchile-visa-cuenta-fan",
  "visa-credito-gold": "bchile-visa-credito-gold",
  "mastercard-credito-black": "bchile-mastercard-credito-black",
  "mastercard-credito-platinum": "bchile-mastercard-credito-platinum",
  "mastercard-credito-dorada": "bchile-mastercard-credito-dorada",
  "visa-debito-infinite": "bchile-visa-debito-infinite",
  "visa-debito-signature": "bchile-visa-debito-signature"
};

// ── Helpers de parsing ───────────────────────────────────────────────────────
const stripHtml = (h) =>
  (h || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&aacute;/g, "á")
    .replace(/\s+/g, " ")
    .trim();

const slugify = (s) =>
  (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);

const intCLP = (s) => (s ? parseInt(String(s).replace(/[.\s]/g, ""), 10) : null);

/** Descuento entero desde "Tipo Beneficio" ("40% dto", "20%; dto."). */
function parseDiscount(tipo) {
  const m = (String(tipo || "").toLowerCase().match(/(\d{1,3})\s*%/) || [])[1];
  return m ? parseInt(m, 10) : null;
}

/** days_of_week (0=domingo..6=sabado) desde meta.tags. [] = todos los dias. */
function parseDays(tags) {
  const d = (tags || [])
    .map((x) => DAYS[String(x).toLowerCase()])
    .filter((x) => x !== undefined);
  return [...new Set(d)].sort((a, b) => a - b);
}

/** cap CLP desde "Tope ... $50.000". */
function parseCap(text) {
  const m = text.match(/tope[^$]{0,40}\$\s*([\d.]{3,})/i);
  return m ? intCLP(m[1]) : null;
}

/** min_purchase CLP desde "compra/monto/consumo minimo $X". */
function parseMin(text) {
  const m = text.match(
    /(?:compra|monto|consumo)[^$]{0,30}m[ií]nim[oa][^$]{0,20}\$\s*([\d.]{3,})/i
  );
  return m ? intCLP(m[1]) : null;
}

/** Busca códigos de descuento en el texto (ej: "código JUMBO20", "ingresa BCHILE10", "cupón: PROMO"). */
function parseCode(text) {
  if (!text) return null;
  const regexes = [
    /(?:c[oó]digo|cup[oó]n|cod\.|c[oó]d|clave)[^\w]{0,5}\b([A-Za-z0-9_-]{3,20})\b/g,
    /usando el c[oó]digo\s+([A-Za-z0-9_-]{3,20})/gi,
    /ingresando\s+(?:el\s+)?(?:c[oó]digo\s+)?([A-Za-z0-9_-]{4,20})\b/gi,
    /con el cup[oó]n\s+([A-Za-z0-9_-]{3,20})/gi
  ];

  for (const rx of regexes) {
    const matches = [...text.matchAll(rx)];
    for (const match of matches) {
      const candidate = match[1];
      const hasLetters = /[a-zA-Z]/.test(candidate);
      const isNotDate = !/^(?:202\d|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|lunes|martes|miercoles|miércoles|jueves|viernes|sabado|sábado|domingo)$/i.test(candidate);
      const isNotCommonWord = !/^(?:USD|CLP|UF|VISA|MASTER|AMEX|CMR|BCI|EDWARDS|BANCO|CHILE|WEB|APP|DEL|CON|POR|PARA|DESCUENTO|TOPE|TOTAL|MINIMO|MINIMA|VIGENCIA|PROMO|COMPRA|DESCTO|DESCUENTOS|CUPON|CODIGO)$/i.test(candidate);
      
      if (hasLetters && isNotDate && isNotCommonWord) {
        return candidate.toUpperCase();
      }
    }
  }
  return null;
}

/**
 * Tarjetas. El CMS lista slugs granulares (visa-credito-infinite, etc).
 * OptiWallet hoy solo modela 2 tarjetas BCh (credit/debit), asi que colapsamos
 * a card_types + los 2 ids bucket. La granularidad fina se preserva en raw.
 */
function mapCards(arr) {
  const types = new Set();
  const ids = [];
  (arr || []).forEach((s) => {
    const l = String(s).toLowerCase();
    if (l.includes("credito")) types.add("credit");
    else if (l.includes("debito")) types.add("debit");
    else if (l.includes("cuenta") || l.includes("fan")) types.add("debit");
    else if (l.includes("prepag")) types.add("prepaid");

    const dbId = CMS_TO_DB_CARD[l];
    if (dbId) {
      ids.push(dbId);
    }
  });

  const uniqueIds = [...new Set(ids)];
  const totalCardsCount = Object.keys(CMS_TO_DB_CARD).length;
  // If the mapped list includes ALL cards of the bank, card_ids is empty.
  const finalCardIds = uniqueIds.length === totalCardsCount ? [] : uniqueIds;

  return { card_types: [...types], card_ids: finalCardIds, raw: arr || [] };
}

/** presencial | online | both, heuristico sobre descripcion + condiciones. */
function parseModality(text) {
  const t = text.toLowerCase();
  const pres = /presencial|en el local|en tienda|en el restaurant|sucursal/.test(t);
  const onl =
    /online|e-?commerce|sitio web|por (la )?app|delivery|p[áa]gina web/.test(t);
  if (pres && onl) return "both";
  if (onl) return "online";
  return "presencial";
}

/**
 * Clasificacion de caso borde. Devuelve la categoria, o null si es "clean".
 * El orden importa: lo mas especifico primero.
 */
function classifyEdge(name, tipo, body, cond, cards, discount) {
  const all = `${name} ${tipo} ${body} ${cond}`.toLowerCase();
  if (/cashback|devoluci[óo]n|te devolvemos|devuelve/.test(all)) return "cashback";
  if (/primera compra|primer (uso|pago|compra)|cliente(s)? nuevo|nuevos clientes/.test(all))
    return "primera_compra";
  if (/litro|por litro|\/lt|combustible/.test(all) && discount === null)
    return "por_litro";
  if (/cuotas sin inter[eé]s|sin inter[eé]s/.test(all)) return "cuotas_sin_interes";
  if (/2x1|2 x 1|segundo[ a]|lleva 2|lleva dos|al 50% el segundo/.test(all))
    return "2x1_o_segunda_unidad";
  if (/puntos|gift ?card|tarjeta de regalo|millas|canje/.test(all))
    return "puntos_o_regalo";
  if (discount === null) return "descuento_no_parseable";
  // "Hasta X%" o varios % distintos => descuento variable / multitramo.
  if ((all.match(/(\d{1,3})\s*%/g) || []).length >= 3) return "multi_tramo_o_ambiguo";
  if (!cards.card_types.length) return "sin_tarjeta_mapeada";
  return null;
}

/** Normaliza un entry del CMS a una fila candidata de `promotions`. */
function normalizeEntry(e) {
  const f = e.fields || {};
  const m = e.meta || {};
  const name = f.Titulo || m.name || "";
  const tipo = f["Tipo Beneficio"] || "";
  const body = stripHtml(f.Descripcion);
  const cond = stripHtml(f["Condiciones Comerciales"]) || f.Vigencia || "";
  const cards = mapCards(f["Tarjetas Permitidas"]);
  const discount = parseDiscount(tipo);

  const edge = classifyEdge(name, tipo, body, cond, cards, discount);
  if (edge) {
    return { edge, record: { name, tipo, cards: cards.raw.length, slug: m.slug } };
  }

  const slug = slugify(name);
  const mid = KNOWN_MERCHANTS[name.toLowerCase()] || KNOWN_MERCHANTS[slug] || null;
  const textForCaps = `${cond} ${body}`;

  // Priority redirect link resolution
  const rawWeb = f["Sitio web"] ? String(f["Sitio web"]).trim() : "";
  let webUrl = "";
  if (rawWeb) {
    webUrl = rawWeb.match(/^https?:\/\//i) ? rawWeb : `https://${rawWeb}`;
  }
  const rawPak = f["Url Beneficio Pak"] ? String(f["Url Beneficio Pak"]).trim() : "";
  const rawExt = f["Url Beneficio Externa"] ? String(f["Url Beneficio Externa"]).trim() : "";
  const rawUrl = f["Url"] ? String(f["Url"]).trim() : "";

  const redirectUrl = webUrl || rawPak || rawExt || rawUrl || `https://sitiospublicos.bancochile.cl/personas/beneficios/detalle/${m.slug || slug}`;

  // Start date from updated_at
  const start_date = (m.updated_at || "").slice(0, 10) || null;

  // Merge description and conditions
  const combinedConditions = [body, cond].filter(Boolean).join("\n\n");

  return {
    edge: null,
    record: {
      _merchant_resolved: !!mid,
      merchant_id: mid || `NEW:${slug}`,
      merchant_name: name,
      bank_id: BANK_ID,
      discount,
      cap: parseCap(textForCaps),
      min_purchase: parseMin(textForCaps),
      days_of_week: parseDays(m.tags),
      card_types: cards.card_types,
      card_ids: cards.card_ids,
      _source_cards: cards.raw,
      modality: parseModality(`${body} ${cond}`),
      start_date,
      end_date: (m.unpublish_at || "").slice(0, 10) || null,
      stackable: /\bacumulable\b/i.test(cond) && !/no\s+(es\s+)?acumulable/i.test(cond),
      code: parseCode(textForCaps),
      conditions: combinedConditions,
      category_path: m.category || "",
      source: redirectUrl,
      verified_at: new Date().toISOString().slice(0, 10),
    },
  };
}

/** Procesa una lista de entries crudos. Reutilizable desde un navegador. */
export function parseEntries(entries) {
  const clean = [];
  const edges = {};
  for (const e of entries) {
    const { edge, record } = normalizeEntry(e);
    if (edge) (edges[edge] = edges[edge] || []).push(record);
    else clean.push(record);
  }
  return { clean, edges };
}

// ── Fetch (capa especifica del banco) ─────────────────────────────────────────
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function impervaHelp(detail) {
  return (
    `${detail}\n` +
    `  Suele ser Imperva (anti-bot) cortando la conexion desde Node.\n` +
    `  Solucion: copia la cookie de tu navegador y reintenta:\n` +
    `    1) Abri ${BASE.replace("/api/content/spaces/personas/types", "/personas/beneficios/categoria")}\n` +
    `    2) DevTools > Network > click cualquier request al dominio > copia el header "Cookie"\n` +
    `    3) BCH_COOKIE="visid_incap_...; incap_ses_..." node scripts/scrapers/banco-chile.mjs`
  );
}

/**
 * Carga la cookie de Imperva. Prioridad: env BCH_COOKIE, luego el archivo
 * scripts/scrapers/.bch-cookie.txt (gitignored). El archivo acepta DOS formatos:
 *   a) un header ya armado:  name=value; name=value; ...
 *   b) el PEGADO CRUDO de la tabla de DevTools (Application > Cookies) — el
 *      parser extrae los pares name/value relevantes aunque esté desordenado.
 */
function loadCookie() {
  if (process.env.BCH_COOKIE) return process.env.BCH_COOKIE.trim();
  if (!existsSync(COOKIE_FILE)) return "";
  const raw = readFileSync(COOKIE_FILE, "utf-8").trim();
  if (!raw) return "";
  // Formato (a): ya es un cookie header.
  if (/^[\w.-]+=/.test(raw) && raw.includes(";")) return raw.replace(/\s+/g, " ").trim();
  // Formato (b): pegado crudo de DevTools → name <espacio/tab> value <resto...>.
  const NAME = /^(visid_incap_\d+|incap_ses_\d+_\d+|nlbi_[\d_]+|reese84)$/;
  const tok = raw.split(/\s+/);
  const pairs = [];
  for (let i = 0; i < tok.length - 1; i++) {
    if (NAME.test(tok[i])) pairs.push(`${tok[i]}=${tok[i + 1]}`);
  }
  return pairs.join("; ");
}

/**
 * Fetch de todos los beneficios del CMS (paginado). Retorna entries crudos
 * listos para parseEntries().
 *
 * cookie  — Imperva cookie string. Si se omite, carga desde BCH_COOKIE o
 *           .bch-cookie.txt (uso CLI). Pásala explícita desde el servidor.
 * opts.silent  — suprime console.log
 * opts.onLog(msg, level?) — callback por línea de progreso (útil para SSE)
 */
export async function fetchAll(cookie, opts = {}) {
  const log = (msg, level = "info") => {
    if (opts.onLog) opts.onLog(msg, level);
    else if (!opts.silent) console.log("  " + msg);
  };

  const resolvedCookie = cookie ?? loadCookie();

  const headers = {
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "es-CL,es;q=0.9",
    "User-Agent": UA,
    Referer: "https://sitiospublicos.bancochile.cl/personas/beneficios/categoria",
  };
  if (resolvedCookie) {
    headers.Cookie = resolvedCookie;
    log(`Cookie cargada (${resolvedCookie.length} chars)`);
  } else {
    log("Sin cookie — probando directo; si falla, ver .bch-cookie.txt");
  }

  let page = 1;
  let out = [];
  let total = Infinity;
  log("Leyendo catálogo del CMS...");
  while (out.length < total) {
    const url = `${BASE}/beneficios/entries?page=${page}&per_page=100`;
    let r;
    try {
      r = await fetch(url, { headers });
    } catch (err) {
      const cause = err?.cause?.code ?? err?.cause?.message ?? err?.message ?? "desconocida";
      throw new Error(impervaHelp(`No se pudo conectar a ${url}\n  causa: ${cause}`));
    }
    if (!r.ok) {
      const error = new Error(impervaHelp(`HTTP ${r.status} en ${url}`));
      /** @type {any} */ (error).statusCode = r.status;
      throw error;
    }
    const j = await r.json();
    out = out.concat(j.entries || []);
    total = j.meta?.total_entries ?? out.length;
    log(`Página ${page}: ${out.length}/${total === Infinity ? "?" : total} entries`);
    if (!j.entries || j.entries.length === 0) break;
    page++;
    if (page > 50) break; // guard
  }
  log(`${out.length} entries obtenidos`, "success");
  return out;
}

async function main() {
  const entries = await fetchAll(undefined);

  const { clean, edges } = parseEntries(entries);
  const edgeTotal  = Object.values(edges).reduce((a, v) => a + v.length, 0);
  const resolved   = clean.filter((c) => c._merchant_resolved).length;
  const edgeCounts = Object.fromEntries(Object.entries(edges).map(([k, v]) => [k, v.length]));

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, "banco-chile.clean.json"), JSON.stringify(clean, null, 2));
  writeFileSync(join(OUT_DIR, "banco-chile.edges.json"), JSON.stringify(edges, null, 2));
  writeFileSync(
    join(OUT_DIR, "banco-chile.import.json"),
    JSON.stringify(
      { bank_id: BANK_ID, generated_at: new Date().toISOString(), edge_counts: edgeCounts, clean },
      null, 2
    )
  );

  console.log("\n=== Resumen ===");
  console.log(`Total            ${entries.length}`);
  console.log(`Clean            ${clean.length}  (merchant resuelto: ${resolved}, nuevos: ${clean.length - resolved})`);
  console.log(`Casos borde      ${edgeTotal}`);
  for (const [k, v] of Object.entries(edges).sort((a, b) => b[1].length - a[1].length))
    console.log(`  - ${k.padEnd(24)} ${v.length}`);
  console.log(`\nEscrito en ${OUT_DIR}/`);
  console.log("Sube out/banco-chile.import.json en /admin/ops/import");
}

// Ejecutar solo si se corre directamente (no al importar parseEntries).
// pathToFileURL normaliza la ruta cross-plataforma (en Windows process.argv[1]
// viene con backslashes y letra de unidad, la comparacion naive nunca matcheaba).
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
