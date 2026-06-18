import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { sql } from "@/lib/db";
import { requireAdmin, clientIp } from "@/lib/admin-guard";
import { logAdminAction } from "@/lib/admin-log";
import { isValidId } from "@/lib/validate";
import { normalizeRow, type ScrapedRow, type StagedRow } from "@/lib/staging";
import { NextRequest, NextResponse } from "next/server";

const NO_CACHE = { "Cache-Control": "no-store" };

// ── Banco de Chile CMS fetch logic ──────────────────────────────────────────
// Mirrors the fetch layer of scripts/scrapers/banco-chile.mjs but runs
// server-side within the Next.js runtime. The parse layer (parseEntries) is
// imported dynamically from the .mjs file since it's a pure function with no
// Node filesystem dependencies.

const BCH_BASE =
  "https://sitiospublicos.bancochile.cl/api/content/spaces/personas/types";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/**
 * Fetch all entries of a CMS content type with pagination.
 * Throws with `statusCode` property on Imperva/anti-bot blocks.
 */
async function fetchCMSEntries(
  type: string,
  cookie?: string,
): Promise<unknown[]> {
  const headers: Record<string, string> = {
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "es-CL,es;q=0.9",
    "User-Agent": UA,
    Referer:
      "https://sitiospublicos.bancochile.cl/personas/beneficios/categoria",
  };
  if (cookie) headers.Cookie = cookie;

  let page = 1;
  let out: unknown[] = [];
  let total = Infinity;
  while (out.length < total) {
    const url = `${BCH_BASE}/${type}/entries?page=${page}&per_page=100`;
    let r: Response;
    try {
      r = await fetch(url, { headers });
    } catch (err: unknown) {
      const cause =
        (err as { cause?: { code?: string; message?: string } }).cause?.code ??
        (err as { cause?: { message?: string } }).cause?.message ??
        (err as Error).message ??
        "desconocida";
      const error = new Error(`No se pudo conectar a ${url} — causa: ${cause}`);
      (error as unknown as { statusCode: number }).statusCode = 0;
      throw error;
    }
    if (!r.ok) {
      const error = new Error(`HTTP ${r.status} en ${url}`);
      (error as unknown as { statusCode: number }).statusCode = r.status;
      throw error;
    }
    const j = (await r.json()) as {
      entries?: unknown[];
      meta?: { total_entries?: number };
    };
    out = out.concat(j.entries || []);
    total = j.meta?.total_entries ?? out.length;
    if (!j.entries || j.entries.length === 0) break;
    page++;
    if (page > 50) break; // guard
  }
  return out;
}

/**
 * Map of bank_id → scraper functions.
 * Each bank that supports auto-fetch must provide fetchAll + parseEntries.
 *
 * The scraper .mjs is loaded via runtime dynamic import (pathToFileURL) to
 * bypass Next.js/webpack bundling — the module lives outside app/ and uses
 * Node APIs (fs, etc.) that the bundler can't statically resolve. The
 * `parseEntries` export is a pure function with no FS deps, so it works fine
 * at runtime.
 */
async function loadScraper(bankId: string) {
  if (bankId === "banco-chile") {
    const scraperPath = join(process.cwd(), "scripts/scrapers/banco-chile.mjs");
    // Bypass webpack/turbopack static analysis — this is a runtime-only import
    // of a pure-JS module that lives outside app/. The bundler can't resolve it
    // statically (and doesn't need to — it's never bundled, just loaded at runtime).
    const dynamicImport = new Function("p", "return import(p)") as (p: string) => Promise<Record<string, unknown>>;
    const mod = (await dynamicImport(pathToFileURL(scraperPath).href)) as {
      parseEntries: (
        entries: unknown[],
      ) => {
        clean: ScrapedRow[];
        edges: Record<string, unknown[]>;
      };
    };
    return {
      fetchAll: (cookie?: string) => fetchCMSEntries("beneficios", cookie),
      parseEntries: mod.parseEntries,
    };
  }
  return null;
}

/**
 * POST /api/admin/ops/fetch
 *
 * Ejecuta el scraper de un banco desde el servidor y auto-importa los
 * resultados a staging. Maneja el flujo de cookie de Imperva:
 *
 * 1. Intenta con la cookie guardada en app_settings (si existe).
 * 2. Si se pasa `cookie` en el body, la usa y la guarda para futuros fetches.
 * 3. Si Imperva bloquea (307/403), devuelve 428 con instrucciones.
 *
 * Body: { bank_id: string, cookie?: string }
 * Responses:
 *   201 — éxito, con resumen de importación
 *   400 — bank_id inválido o sin scraper
 *   401 — sin sesión admin
 *   428 — cookie requerida (Imperva block)
 *   500 — error interno
 */
export async function POST(req: NextRequest) {
  const session = await requireAdmin(req);
  if (!session) {
    return NextResponse.json(
      { error: "No autorizado" },
      { status: 401, headers: NO_CACHE },
    );
  }

  try {
    const body = await req.json().catch(() => null);
    const bankId: string = body?.bank_id;
    const providedCookie: string | undefined = body?.cookie;

    if (!bankId || !isValidId(bankId)) {
      return NextResponse.json(
        { error: "bank_id inválido" },
        { status: 400, headers: NO_CACHE },
      );
    }

    // Verificar que el banco existe.
    const bankRows = await sql`SELECT id FROM banks WHERE id = ${bankId}`;
    if (bankRows.length === 0) {
      return NextResponse.json(
        { error: `El banco '${bankId}' no existe` },
        { status: 400, headers: NO_CACHE },
      );
    }

    // Verificar que hay un scraper para este banco.
    const scraper = await loadScraper(bankId);
    if (!scraper) {
      return NextResponse.json(
        { error: `No hay scraper configurado para '${bankId}'` },
        { status: 400, headers: NO_CACHE },
      );
    }

    // Resolver cookie: proveída > guardada en DB > ninguna.
    let cookie = providedCookie;
    if (!cookie) {
      const settingKey = `bch_cookie_${bankId}`;
      const stored =
        await sql`SELECT value FROM app_settings WHERE key = ${settingKey}`;
      if (stored.length > 0) cookie = (stored[0] as { value: string }).value;
    }

    // ── Fetch ────────────────────────────────────────────────────────────────
    let entries: unknown[];
    try {
      entries = await scraper.fetchAll(cookie || undefined);
    } catch (err: unknown) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      // Imperva block: 307 redirect loop, 403, or connection issue.
      if (
        statusCode === 307 ||
        statusCode === 403 ||
        statusCode === 0 ||
        (err instanceof Error &&
          /cookie-challenge|imperva|incap/i.test(err.message))
      ) {
        return NextResponse.json(
          {
            error: "cookie_required",
            message:
              "El sitio del banco bloqueó la conexión (anti-bot Imperva). Pega la cookie de tu navegador.",
            instructions: [
              "1. Abre https://sitiospublicos.bancochile.cl/personas/beneficios/categoria en tu navegador",
              '2. DevTools → Network → click cualquier request al dominio → copia el header "Cookie"',
              "3. Pégala en el campo de abajo e intenta de nuevo",
            ],
          },
          { status: 428, headers: NO_CACHE },
        );
      }
      throw err; // otro error → 500
    }

    // ── Cache Comparison (to prevent processing of unchanged raw entries) ──
    const cachedRows = await sql`SELECT uuid, raw_json FROM scraper_raw_cache WHERE bank_id = ${bankId}`;
    const cacheMap = new Map<string, string>(
      cachedRows.map((r) => [r.uuid as string, JSON.stringify(r.raw_json)])
    );

    const changedEntries: unknown[] = [];
    const entriesToUpsert: { uuid: string; raw_json: unknown }[] = [];

    for (const e of entries) {
      const uuid = (e as any)?.meta?.uuid;
      if (!uuid) {
        changedEntries.push(e);
        continue;
      }
      const currentStr = JSON.stringify(e);
      const cachedStr = cacheMap.get(uuid);

      if (cachedStr === currentStr) {
        continue;
      }

      changedEntries.push(e);
      entriesToUpsert.push({ uuid, raw_json: e });
    }

    // ── Parse ────────────────────────────────────────────────────────────────
    const { clean: rawClean, edges } = scraper.parseEntries(changedEntries);
    const edgeCounts = Object.fromEntries(
      Object.entries(edges).map(([k, v]) => [k, v.length]),
    );
    const edgeCount = Object.values(edgeCounts).reduce((a, n) => a + n, 0);

    // ── Import a staging (misma lógica que POST /api/admin/ops/import) ──────
    const [merchantRows, fpRows] = await Promise.all([
      sql`SELECT id FROM merchants`,
      sql`SELECT fingerprint FROM promo_staging WHERE bank_id = ${bankId} AND status IN ('pending','approved')`,
    ]);
    const knownMerchants = new Set(
      merchantRows.map((r) => (r as { id: string }).id),
    );
    const existingFp = new Set(
      fpRows.map((r) => (r as { fingerprint: string }).fingerprint),
    );

    const seen = new Set<string>();
    const staged: StagedRow[] = [];
    let skipped = 0;
    for (const row of rawClean as ScrapedRow[]) {
      const norm = normalizeRow(bankId, row, knownMerchants);
      if (existingFp.has(norm.fingerprint) || seen.has(norm.fingerprint)) {
        skipped++;
        continue;
      }
      seen.add(norm.fingerprint);
      staged.push(norm);
    }

    const total = (rawClean as ScrapedRow[]).length;
    const imported = staged.length;

    // Registrar corrida.
    const runRes = await sql`
      INSERT INTO scraper_runs (bank_id, source, total, imported, skipped, edge_count, admin_email)
      VALUES (${bankId}, 'fetch', ${total}, ${imported}, ${skipped}, ${edgeCount}, ${session.email})
      RETURNING id
    `;
    const runId = (runRes[0] as { id: number }).id;

    // Insertar a staging.
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

    // Upsert raw JSON entries that changed/were new into raw cache
    if (entriesToUpsert.length > 0) {
      for (const item of entriesToUpsert) {
        await sql`
          INSERT INTO scraper_raw_cache (bank_id, uuid, raw_json, updated_at)
          VALUES (${bankId}, ${item.uuid}, ${JSON.stringify(item.raw_json)}::jsonb, now())
          ON CONFLICT (bank_id, uuid) DO UPDATE
          SET raw_json = EXCLUDED.raw_json, updated_at = now()
        `;
      }
    }

    // Guardar cookie exitosa en DB para reutilizar.
    if (cookie) {
      const settingKey = `bch_cookie_${bankId}`;
      await sql`
        INSERT INTO app_settings (key, value, updated_at, updated_by)
        VALUES (${settingKey}, ${cookie}, now(), ${session.email})
        ON CONFLICT (key) DO UPDATE SET value = ${cookie}, updated_at = now(), updated_by = ${session.email}
      `;
    }

    await logAdminAction(
      session,
      "import",
      "scraper_run",
      String(runId),
      `Auto-fetch ${bankId}: ${entries.length} raw → ${total} clean, ${imported} a staging, ${skipped} duplicados, ${edgeCount} edges`,
      clientIp(req),
    );

    return NextResponse.json(
      {
        run_id: runId,
        raw_entries: entries.length,
        total,
        imported,
        skipped,
        edge_count: edgeCount,
        edge_counts: edgeCounts,
      },
      { status: 201, headers: NO_CACHE },
    );
  } catch (err) {
    console.error("POST /api/admin/ops/fetch failed:", err);
    return NextResponse.json(
      { error: "Error interno al ejecutar el scraper" },
      { status: 500, headers: NO_CACHE },
    );
  }
}
