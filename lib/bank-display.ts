// lib/bank-display.ts
// Identidad visual de cada banco (monograma + color de marca), única fuente de
// verdad compartida por WalletSetup, el feed del dashboard y el detalle de comercio.
// Antes el mapa vivía duplicado dentro de WalletSetup; centralizarlo mantiene el
// branding consistente en toda la app y evita que una fila se vea "fuera de lugar".

export interface BankVisual {
  /** Monograma corto para el avatar (2–3 letras). */
  letter: string;
  /** Color de marca (fondo del avatar / acento). */
  color: string;
  /** Color de texto legible sobre `color` (negro o blanco según luminancia). */
  text: string;
}

// Abreviaturas y colores de marca por banco. Incluye alias de IDs históricos
// (ej. "bco-chile" vs "banco-chile") para no romper datos existentes.
const BANK_DISPLAY: Record<string, { letter: string; color: string }> = {
  "bice":          { letter: "BI",  color: "#003087" },
  "falabella":     { letter: "FB",  color: "#8CC63F" },
  "ripley":        { letter: "RP",  color: "#6B2D8B" },
  "santander":     { letter: "SA",  color: "#EC0000" },
  "security":      { letter: "SE",  color: "#1A3D6D" },
  "bco-chile":     { letter: "BC",  color: "#003A70" },
  "banco-chile":   { letter: "BC",  color: "#003A70" },
  "bci":           { letter: "BCI", color: "#0033A0" },
  "banco-estado":  { letter: "BE",  color: "#002D72" },
  "itau":          { letter: "IU",  color: "#FF6600" },
  "mach":          { letter: "MA",  color: "#6C5CE7" },
  "mercado-pago":  { letter: "MP",  color: "#009EE3" },
  "scotiabank":    { letter: "SB",  color: "#EC1C24" },
  "tenpo":         { letter: "TP",  color: "#00C389" },
  "coopeuch":      { letter: "CO",  color: "#E4002B" },
};

const NEUTRAL = "#1a1f1c"; // var(--bg-3) — fallback cuando no hay color de marca

/**
 * Devuelve negro o blanco según cuál tenga mejor contraste sobre `hex`.
 * Usa luminancia relativa (WCAG) para que el monograma sea siempre legible,
 * incluso sobre marcas claras como el verde de Falabella.
 */
export function readableTextColor(hex: string): string {
  const c = hex.replace("#", "");
  if (c.length < 6) return "#ffffff";
  const r = parseInt(c.slice(0, 2), 16) / 255;
  const g = parseInt(c.slice(2, 4), 16) / 255;
  const b = parseInt(c.slice(4, 6), 16) / 255;
  const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  // Umbral ~0.42: por encima el fondo es "claro" → texto oscuro (tinta de la app).
  return L > 0.42 ? "#0b0d0c" : "#ffffff";
}

/**
 * Identidad visual de un banco. Prioriza el color guardado en DB (`dbColor`),
 * luego el del mapa, y por último un neutro. El monograma sale del mapa o de
 * las primeras 2 letras del nombre.
 */
export function getBankVisual(
  bankId: string,
  name?: string | null,
  dbColor?: string | null,
): BankVisual {
  const d = BANK_DISPLAY[bankId];
  const letter = d?.letter ?? (name ?? bankId).slice(0, 2).toUpperCase();
  const color = dbColor || d?.color || NEUTRAL;
  return { letter, color, text: readableTextColor(color) };
}
