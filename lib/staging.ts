import "server-only";
import { createHash } from "node:crypto";

/**
 * Helpers de staging (importación de promos scrapeadas → revisión).
 *
 * Mantiene fuera de las rutas la lógica pura: normalización del payload del
 * scraper, fingerprint para dedup, y cálculo de warnings (verificaciones no
 * bloqueantes que se le muestran al revisor).
 */

export type ScrapedRow = {
  merchant_id?: string | null; // puede venir "NEW:slug" desde el scraper
  merchant_name?: string | null;
  discount?: number | null;
  discount_per_unit?: number | null;
  discount_unit?: string | null;
  cap?: number | null;
  min_purchase?: number | null;
  days_of_week?: number[];
  card_types?: string[];
  card_ids?: string[];
  _source_cards?: string[];
  modality?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  stackable?: boolean;
  code?: string | null;
  conditions?: string | null;
  source?: string | null;
};

export type StagedRow = {
  merchant_name: string;
  merchant_id: string | null;
  discount: number | null;
  discount_per_unit: number | null;
  discount_unit: string | null;
  cap: number | null;
  min_purchase: number | null;
  days_of_week: number[];
  card_types: string[];
  card_ids: string[];
  source_cards: string[];
  modality: string | null;
  start_date: string | null;
  end_date: string | null;
  stackable: boolean;
  code: string | null;
  conditions: string | null;
  source: string;
  warnings: string[];
  fingerprint: string;
};

export function slugify(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

/** Quita el prefijo "NEW:" que pone el scraper cuando no resolvió el comercio. */
export function stripNewPrefix(id: string | null | undefined): string | null {
  if (!id) return null;
  return id.startsWith("NEW:") ? id.slice(4) : id;
}

/**
 * Fingerprint estable del contenido de una promo, para deduplicar reimports.
 * No incluye fechas de vigencia (se actualizan) ni el merchant resuelto.
 */
export function fingerprint(bankId: string, r: ScrapedRow): string {
  const parts = [
    bankId,
    slugify(r.merchant_name || ""),
    r.discount ?? "",
    r.discount_per_unit ?? "",
    (r.days_of_week ?? []).slice().sort((a, b) => a - b).join(","),
    (r.card_types ?? []).slice().sort().join(","),
    r.modality ?? "",
  ].join("|");
  return createHash("sha1").update(parts).digest("hex").slice(0, 16);
}

/**
 * Genera un id de promoción válido (slug ≤64) y estable: banco + comercio +
 * hash del fingerprint para no colisionar entre promos del mismo comercio.
 */
export function promoId(bankId: string, merchantId: string, fp: string): string {
  const base = `${bankId}-${merchantId}`.slice(0, 54);
  return `${base}-${fp.slice(0, 8)}`.slice(0, 64);
}

/**
 * Normaliza una fila cruda del scraper a la forma de promo_staging y calcula
 * warnings. `knownMerchantIds` permite auto-resolver el merchant cuando el
 * slug ya existe en la tabla `merchants`.
 */
export function normalizeRow(
  bankId: string,
  r: ScrapedRow,
  knownMerchantIds: Set<string>
): StagedRow {
  const candidate = stripNewPrefix(r.merchant_id) || slugify(r.merchant_name || "");
  const resolved = knownMerchantIds.has(candidate) ? candidate : null;

  const warnings: string[] = [];
  if (!resolved) warnings.push("comercio_nuevo");
  if (!r.end_date) warnings.push("sin_fecha_termino");
  if (!r.card_types || r.card_types.length === 0) warnings.push("sin_tipo_tarjeta");
  const hasPct = typeof r.discount === "number";
  const hasPu = typeof r.discount_per_unit === "number" && !!r.discount_unit;
  if (hasPct === hasPu) warnings.push("descuento_ambiguo"); // ni uno ni ambos

  return {
    merchant_name: r.merchant_name || candidate,
    merchant_id: resolved,
    discount: r.discount ?? null,
    discount_per_unit: r.discount_per_unit ?? null,
    discount_unit: r.discount_unit ?? null,
    cap: r.cap ?? null,
    min_purchase: r.min_purchase ?? null,
    days_of_week: r.days_of_week ?? [],
    card_types: r.card_types ?? [],
    card_ids: [], // los slugs granulares del banco no mapean a cards reales; ver source_cards
    source_cards: r._source_cards ?? r.card_ids ?? [],
    modality: r.modality ?? null,
    start_date: r.start_date ?? null,
    end_date: r.end_date ?? null,
    stackable: !!r.stackable,
    code: r.code ?? null,
    conditions: r.conditions ?? null,
    source: r.source || "",
    warnings,
    fingerprint: fingerprint(bankId, r),
  };
}
