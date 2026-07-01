import "server-only";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { sql } from "@/lib/db";
import { normalizeRow, type ScrapedRow, type StagedRow } from "@/lib/staging";

/**
 * Núcleo compartido del auto-fetch de un banco: ejecuta el scraper, compara con
 * caché, parsea e importa a staging. Es un async generator que EMITE progreso
 * (para el terminal SSE) y DEVUELVE el resultado final. Lo consumen tanto la ruta
 * JSON (`/api/admin/ops/fetch`, ignora el progreso) como la ruta SSE
 * (`/api/admin/ops/fetch/stream`, transmite cada línea al TerminalConsole).
 */

interface Scraper {
  fetchAll: (cookie?: string) => Promise<unknown[]>;
  parseEntries: (entries: unknown[]) => { clean: ScrapedRow[]; edges: Record<string, unknown[]> };
}

async function loadScraper(bankId: string): Promise<Scraper | null> {
  // Bypass webpack/turbopack static analysis for runtime-only .mjs imports.
  const dynamicImport = new Function("p", "return import(p)") as (
    p: string,
  ) => Promise<Record<string, unknown>>;

  if (bankId === "banco-chile") {
    const scraperPath = join(process.cwd(), "scripts/scrapers/banco-chile.mjs");
    const mod = (await dynamicImport(pathToFileURL(scraperPath).href)) as {
      fetchAll: (cookie: string | undefined, opts: { silent: boolean }) => Promise<unknown[]>;
      parseEntries: (entries: unknown[]) => { clean: ScrapedRow[]; edges: Record<string, unknown[]> };
    };
    return {
      fetchAll: (cookie?: string) => mod.fetchAll(cookie, { silent: true }),
      parseEntries: mod.parseEntries,
    };
  }

  // BCI / Itaú: solo scripts locales, no corren en el servidor.
  return null;
}

export type FetchProgress = { level: "info" | "warn" | "error" | "success"; msg: string };

export type FetchSummary = {
  kind: "done";
  run_id: number;
  raw_entries: number;
  total: number;
  imported: number;
  skipped: number;
  edge_count: number;
  edge_counts: Record<string, number>;
};
export type FetchCookieRequired = { kind: "cookie_required"; message: string; instructions: string[] };
export type FetchNoScraper = { kind: "no_scraper" };
export type FetchOutcome = FetchSummary | FetchCookieRequired | FetchNoScraper;

const COOKIE_REQUIRED: FetchCookieRequired = {
  kind: "cookie_required",
  message: "El sitio del banco bloqueó la conexión (anti-bot Imperva). Pega la cookie de tu navegador.",
  instructions: [
    "1. Abre https://sitiospublicos.bancochile.cl/personas/beneficios/categoria en tu navegador",
    '2. DevTools → Network → click cualquier request al dominio → copia el header "Cookie"',
    "3. Pégala en el campo de abajo e intenta de nuevo",
  ],
};

export async function* runBankFetch(params: {
  bankId: string;
  providedCookie?: string;
  adminEmail: string;
}): AsyncGenerator<FetchProgress, FetchOutcome, void> {
  const { bankId, providedCookie, adminEmail } = params;

  yield { level: "info", msg: `Cargando scraper de ${bankId}…` };
  const scraper = await loadScraper(bankId);
  if (!scraper) return { kind: "no_scraper" };

  // Resolver cookie: proveída > guardada en DB > ninguna.
  let cookie = providedCookie;
  if (cookie) {
    yield { level: "info", msg: "Usando la cookie que pegaste." };
  } else {
    const stored = await sql`SELECT value FROM app_settings WHERE key = ${`bch_cookie_${bankId}`}`;
    if (stored.length > 0) {
      cookie = (stored[0] as { value: string }).value;
      yield { level: "info", msg: "Usando cookie guardada de un fetch anterior." };
    }
  }

  // ── Fetch ────────────────────────────────────────────────────────────────
  yield { level: "info", msg: "Conectando con el sitio del banco…" };
  yield { level: "info", msg: "Descargando beneficios — esto puede tardar hasta ~1 min…" };
  let entries: unknown[];
  try {
    entries = await scraper.fetchAll(cookie || undefined);
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number }).statusCode;
    if (
      statusCode === 307 || statusCode === 403 || statusCode === 0 ||
      (err instanceof Error && /cookie-challenge|imperva|incap/i.test(err.message))
    ) {
      return COOKIE_REQUIRED;
    }
    throw err;
  }
  yield { level: "success", msg: `${entries.length} entradas recibidas del banco.` };

  // ── Comparación con caché (evita reprocesar entradas sin cambios) ──────────
  yield { level: "info", msg: "Comparando con la caché local…" };
  const cachedRows = await sql`SELECT uuid, raw_json FROM scraper_raw_cache WHERE bank_id = ${bankId}`;
  const cacheMap = new Map<string, string>(
    cachedRows.map((r) => [r.uuid as string, JSON.stringify(r.raw_json)]),
  );

  const changedEntries: unknown[] = [];
  const entriesToUpsert: { uuid: string; raw_json: unknown }[] = [];
  for (const e of entries) {
    const uuid = (e as { meta?: { uuid?: string } } | null)?.meta?.uuid;
    if (!uuid) { changedEntries.push(e); continue; }
    const currentStr = JSON.stringify(e);
    if (cacheMap.get(uuid) === currentStr) continue;
    changedEntries.push(e);
    entriesToUpsert.push({ uuid, raw_json: e });
  }
  yield { level: "info", msg: `${changedEntries.length} entradas nuevas o modificadas (de ${entries.length}).` };

  // ── Parse ──────────────────────────────────────────────────────────────────
  yield { level: "info", msg: "Parseando promociones…" };
  const { clean: rawClean, edges } = scraper.parseEntries(changedEntries);
  const edgeCounts = Object.fromEntries(Object.entries(edges).map(([k, v]) => [k, v.length]));
  const edgeCount = Object.values(edgeCounts).reduce((a, n) => a + n, 0);
  yield { level: "info", msg: `${(rawClean as ScrapedRow[]).length} promos limpias, ${edgeCount} casos borde.` };

  // ── Import a staging ────────────────────────────────────────────────────────
  yield { level: "info", msg: "Importando a staging…" };
  const [merchantRows, fpRows] = await Promise.all([
    sql`SELECT id FROM merchants`,
    sql`SELECT fingerprint FROM promo_staging WHERE bank_id = ${bankId} AND status IN ('pending','approved')`,
  ]);
  const knownMerchants = new Set(merchantRows.map((r) => (r as { id: string }).id));
  const existingFp = new Set(fpRows.map((r) => (r as { fingerprint: string }).fingerprint));

  const seen = new Set<string>();
  const staged: StagedRow[] = [];
  let skipped = 0;
  for (const row of rawClean as ScrapedRow[]) {
    const norm = normalizeRow(bankId, row, knownMerchants);
    if (existingFp.has(norm.fingerprint) || seen.has(norm.fingerprint)) { skipped++; continue; }
    seen.add(norm.fingerprint);
    staged.push(norm);
  }

  const total = (rawClean as ScrapedRow[]).length;
  const imported = staged.length;

  const runRes = await sql`
    INSERT INTO scraper_runs (bank_id, source, total, imported, skipped, edge_count, admin_email)
    VALUES (${bankId}, 'fetch', ${total}, ${imported}, ${skipped}, ${edgeCount}, ${adminEmail})
    RETURNING id
  `;
  const runId = (runRes[0] as { id: number }).id;

  if (staged.length > 0) {
    await sql`
      INSERT INTO promo_staging (
        run_id, bank_id, merchant_name, merchant_id, discount, discount_per_unit, discount_unit,
        cap, min_purchase, days_of_week, card_types, card_ids, source_cards, modality,
        start_date, end_date, stackable, code, conditions, source, warnings, fingerprint
      )
      SELECT ${runId}, ${bankId}, x.merchant_name, x.merchant_id, x.discount, x.discount_per_unit, x.discount_unit,
             x.cap, x.min_purchase, x.days_of_week, x.card_types, x.card_ids, x.source_cards, x.modality,
             x.start_date, x.end_date, x.stackable, x.code, x.conditions, x.source, x.warnings, x.fingerprint
      FROM jsonb_to_recordset(${JSON.stringify(staged)}::jsonb) AS x(
        merchant_name text, merchant_id text, discount int, discount_per_unit int, discount_unit text,
        cap int, min_purchase int, days_of_week smallint[], card_types text[], card_ids text[],
        source_cards text[], modality text, start_date date, end_date date, stackable boolean,
        code text, conditions text, source text, warnings text[], fingerprint text
      )
    `;
  }

  for (const item of entriesToUpsert) {
    await sql`
      INSERT INTO scraper_raw_cache (bank_id, uuid, raw_json, updated_at)
      VALUES (${bankId}, ${item.uuid}, ${JSON.stringify(item.raw_json)}::jsonb, now())
      ON CONFLICT (bank_id, uuid) DO UPDATE
      SET raw_json = EXCLUDED.raw_json, updated_at = now()
    `;
  }

  if (cookie) {
    const settingKey = `bch_cookie_${bankId}`;
    await sql`
      INSERT INTO app_settings (key, value, updated_at, updated_by)
      VALUES (${settingKey}, ${cookie}, now(), ${adminEmail})
      ON CONFLICT (key) DO UPDATE SET value = ${cookie}, updated_at = now(), updated_by = ${adminEmail}
    `;
  }

  yield { level: "success", msg: `${imported} promos importadas a staging · ${skipped} duplicados omitidos.` };

  return {
    kind: "done",
    run_id: runId,
    raw_entries: entries.length,
    total,
    imported,
    skipped,
    edge_count: edgeCount,
    edge_counts: edgeCounts,
  };
}
