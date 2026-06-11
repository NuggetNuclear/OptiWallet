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
