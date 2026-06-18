import { readFileSync, existsSync } from "node:fs";

const COOKIE_FILE = "d:/Code/OptiWallet/scripts/scrapers/.bch-cookie.txt";
const url = "https://sitiospublicos.bancochile.cl/api/content/spaces/personas/types/beneficios/entries?page=1&per_page=100";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function loadCookie() {
  if (process.env.BCH_COOKIE) return process.env.BCH_COOKIE.trim();
  if (!existsSync(COOKIE_FILE)) return "";
  const raw = readFileSync(COOKIE_FILE, "utf-8").trim();
  if (!raw) return "";
  if (/^[\w.-]+=/.test(raw) && raw.includes(";")) return raw.replace(/\s+/g, " ").trim();
  const NAME = /^(visid_incap_\d+|incap_ses_\d+_\d+|nlbi_[\d_]+|reese84)$/;
  const tok = raw.split(/\s+/);
  const pairs = [];
  for (let i = 0; i < tok.length - 1; i++) {
    if (NAME.test(tok[i])) pairs.push(`${tok[i]}=${tok[i + 1]}`);
  }
  return pairs.join("; ");
}

async function main() {
  const headers = {
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "es-CL,es;q=0.9",
    "User-Agent": UA,
    Referer: "https://sitiospublicos.bancochile.cl/personas/beneficios/categoria",
  };
  const cookie = loadCookie();
  if (cookie) headers.Cookie = cookie;

  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();

  console.log(`Analizando ${j.entries.length} entries...`);
  const samples = [];
  for (const e of j.entries) {
    const f = e.fields || {};
    const meta = e.meta || {};
    
    // Check if any of these fields are populated
    const hasUrl = !!f["Url"];
    const hasSitio = !!f["Sitio web"];
    const hasUrlExt = !!f["Url Beneficio Externa"];
    const hasCta = !!f["Call To Action"];
    const hasPak = !!f["Url Beneficio Pak"];

    if (hasUrl || hasSitio || hasUrlExt || hasCta || hasPak) {
      samples.push({
        title: f["Titulo"],
        slug: meta.slug,
        Url: f["Url"] || null,
        SitioWeb: f["Sitio web"] || null,
        UrlBeneficioExterna: f["Url Beneficio Externa"] || null,
        CallToAction: f["Call To Action"] || null,
        UrlBeneficioPak: f["Url Beneficio Pak"] || null
      });
    }
  }

  console.log("Muestras con URLs encontradas:");
  console.log(JSON.stringify(samples.slice(0, 15), null, 2));
}

main().catch(console.error);
