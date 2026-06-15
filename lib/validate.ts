/**
 * Validación de IDs que llegan por query string o path params.
 *
 * Todos los IDs del schema (banks, cards, merchants, categories, promotions)
 * son slugs TEXT generados por nosotros: letras, dígitos, guión, guión bajo
 * y punto. Cualquier otra cosa es input malformado o un probe — se rechaza
 * con 400 antes de tocar la base.
 *
 * Nota: las queries ya van parametrizadas (tagged templates de Neon), así que
 * esto NO es la defensa contra SQL injection — es defensa en profundidad:
 * corta payloads basura temprano y mantiene los logs/cache limpios.
 */
const ID_RE = /^[A-Za-z0-9_.-]{1,64}$/;

export function isValidId(value: string): boolean {
  return ID_RE.test(value);
}

/** Valida una lista completa (p. ej. cardIds repetidos en la query). */
export function areValidIds(values: string[]): boolean {
  return values.every(isValidId);
}

// ── Validadores de campos de promoción (writes del panel admin) ───────────────
// Las columnas tienen CHECK constraints en Postgres, pero validar en la capa app
// devuelve 400 (input claro) en vez de 500 (error de DB filtrado). (audit L4)

export const CARD_TYPES = ["credit", "debit", "prepaid"] as const;
export type CardType = (typeof CARD_TYPES)[number];

/** Array no vacío cuyos elementos son todos "credit", "debit" o "prepaid". */
export function isValidCardTypes(v: unknown): v is CardType[] {
  return (
    Array.isArray(v) &&
    v.length > 0 &&
    v.every((t) => t === "credit" || t === "debit" || t === "prepaid")
  );
}

/** Array (posiblemente vacío) de enteros 0–6 (días de la semana). */
export function isValidDaysOfWeek(v: unknown): v is number[] {
  return (
    Array.isArray(v) &&
    v.every((d) => Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 6)
  );
}

/** `null`/`undefined`, o un entero ≥ 0 (cap, min_purchase en CLP). */
export function isNonNegativeIntOrNull(v: unknown): boolean {
  return v === null || v === undefined || (Number.isInteger(v) && (v as number) >= 0);
}

/** `null`/`undefined`, o una fecha `YYYY-MM-DD` lógicamente válida. */
export function isValidDateOrNull(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  return !Number.isNaN(new Date(v + "T00:00:00Z").getTime());
}
