import { sql } from "@/lib/db";
import { requireAdmin, clientIp } from "@/lib/admin-guard";
import { logAdminAction } from "@/lib/admin-log";
import { isValidId } from "@/lib/validate";
import { normalizeRow, type ScrapedRow, type StagedRow } from "@/lib/staging";
import { NextRequest, NextResponse } from "next/server";

const NO_CACHE = { "Cache-Control": "no-store" };
const MAX_ROWS = 5000;

/**
 * POST /api/admin/ops/import
 *
 * Recibe el JSON producido por un scraper (subido desde el panel) y lo deja en
 * `promo_staging` para revisión. NO toca `promotions`. Deduplica por fingerprint
 * contra lo que ya esté pendiente/aprobado del mismo banco, y registra un
 * `scraper_runs` con el resumen.
 *
 * Body: { bank_id: string, clean: ScrapedRow[], edge_counts?: Record<string,number> }
 */
export async function POST(req: NextRequest) {
  const session = await requireAdmin(req);
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401, headers: NO_CACHE });
  }
  try {
    const body = await req.json().catch(() => null);
    const bankId: string = body?.bank_id;
    const clean: ScrapedRow[] = body?.clean;
    const edgeCounts: Record<string, number> = body?.edge_counts ?? {};

    if (!bankId || !isValidId(bankId)) {
      return NextResponse.json({ error: "bank_id inválido" }, { status: 400, headers: NO_CACHE });
    }
    if (!Array.isArray(clean) || clean.length === 0) {
      return NextResponse.json({ error: "El campo 'clean' debe ser un array no vacío" }, { status: 400, headers: NO_CACHE });
    }
    if (clean.length > MAX_ROWS) {
      return NextResponse.json({ error: `Demasiados registros (máx ${MAX_ROWS})` }, { status: 400, headers: NO_CACHE });
    }

    const bankRows = await sql`SELECT id FROM banks WHERE id = ${bankId}`;
    if (bankRows.length === 0) {
      return NextResponse.json({ error: `El banco '${bankId}' no existe` }, { status: 400, headers: NO_CACHE });
    }

    // Comercios conocidos (para auto-resolver) y fingerprints ya en staging (dedup).
    const [merchantRows, fpRows] = await Promise.all([
      sql`SELECT id FROM merchants`,
      sql`SELECT fingerprint FROM promo_staging WHERE bank_id = ${bankId} AND status IN ('pending','approved')`,
    ]);
    const knownMerchants = new Set(merchantRows.map((r) => (r as { id: string }).id));
    const existingFp = new Set(fpRows.map((r) => (r as { fingerprint: string }).fingerprint));

    // Normalizar + dedup (contra DB y dentro del mismo lote).
    const seen = new Set<string>();
    const staged: StagedRow[] = [];
    let skipped = 0;
    for (const row of clean) {
      const norm = normalizeRow(bankId, row, knownMerchants);
      if (existingFp.has(norm.fingerprint) || seen.has(norm.fingerprint)) {
        skipped++;
        continue;
      }
      seen.add(norm.fingerprint);
      staged.push(norm);
    }

    const total = clean.length;
    const imported = staged.length;
    const edgeCount = Object.values(edgeCounts).reduce((a, n) => a + (Number(n) || 0), 0);

    // Registrar la corrida primero (para enlazar run_id).
    const runRes = await sql`
      INSERT INTO scraper_runs (bank_id, source, total, imported, skipped, edge_count, admin_email)
      VALUES (${bankId}, 'upload', ${total}, ${imported}, ${skipped}, ${edgeCount}, ${session.email})
      RETURNING id
    `;
    const runId = (runRes[0] as { id: number }).id;

    // Inserción en lote vía jsonb_to_recordset (un solo round-trip, soporta arrays).
    // El cliente `sql` solo expone el tagged-template, así que pasamos runId/bankId
    // y el payload completo como params interpolados ($1/$2/$3 bajo el capó).
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

    await logAdminAction(
      session,
      "import",
      "scraper_run",
      String(runId),
      `Import ${bankId}: ${imported} a staging, ${skipped} duplicados omitidos, ${edgeCount} casos borde`,
      clientIp(req)
    );

    return NextResponse.json(
      { run_id: runId, total, imported, skipped, edge_count: edgeCount },
      { status: 201, headers: NO_CACHE }
    );
  } catch (err) {
    console.error("POST /api/admin/ops/import failed:", err);
    return NextResponse.json({ error: "Error interno al importar" }, { status: 500, headers: NO_CACHE });
  }
}
