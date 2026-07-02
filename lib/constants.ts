/**
 * Orden de los listados de /app (feed de promos + búsqueda de comercios).
 * "relevance" preserva el score compuesto que calcula /api/recommendations
 * (descuento + popularidad + frescura + urgencia) — es el default porque ese
 * ranking ES la propuesta de valor; los demás son reordenamientos manuales.
 */
export type FeedSortBy = "relevance" | "name" | "popularity" | "discount";

/**
 * Brand colors and abbreviated display names for each supported bank.
 * `color` doubles as the gradient base in RecommendationCard and as the
 * icon background in WalletSetup — keep the two uses in sync here rather
 * than in two separate component-local maps.
 */
export const BANK_INFO: Record<string, { letter: string; color: string }> = {
  "bice":         { letter: "BI",  color: "#003087" },
  "falabella":    { letter: "FB",  color: "#8CC63F" },
  "ripley":       { letter: "RP",  color: "#6B2D8B" },
  "santander":    { letter: "SA",  color: "#EC0000" },
  "security":     { letter: "SE",  color: "#1A3D6D" },
  "bco-chile":    { letter: "BC",  color: "#003A70" },
  "bci":          { letter: "BCI", color: "#0033A0" },
  "banco-estado": { letter: "BE",  color: "#002D72" },
  "itau":         { letter: "IU",  color: "#FF6600" },
  "mach":         { letter: "MA",  color: "#6C5CE7" },
  "mercado-pago": { letter: "MP",  color: "#009EE3" },
  "scotiabank":   { letter: "SB",  color: "#EC1C24" },
  "tenpo":        { letter: "TP",  color: "#00C389" },
  "coopeuch":     { letter: "CO",  color: "#E4002B" },
};
