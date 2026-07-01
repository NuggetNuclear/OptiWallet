import "server-only";
import { generateJSON, aiAvailable } from "./provider";

/**
 * Triage de reportes de usuarios asistido por IA.
 *
 * Toma los reportes YA agrupados por promo (conteos, motivos, notas, fecha de
 * término) y pide al modelo una priorización con un motivo de una línea y una
 * marca de "probablemente muerta". Best-effort: si la IA no está o falla, el
 * caller cae al orden heurístico (conteo desc + vencidas).
 */

export type TriageItem = {
  promotion_id: string;
  merchant: string;
  discount: number | null;
  end_date: string | null; // YYYY-MM-DD o null
  today: string;           // YYYY-MM-DD
  count: number;
  reasons: {
    expired: number;
    wrong_discount: number;
    not_found: number;
    other: number;
    unspecified: number;
  };
  notes: string[];
};

export type TriageResult = {
  promotion_id: string;
  priority: "high" | "med" | "low";
  likely_dead: boolean;
  rationale: string;
};

const MAX_ITEMS = 60;      // acota el prompt
const MAX_NOTES = 3;       // notas por promo en el prompt

export async function triageReports(items: TriageItem[]): Promise<TriageResult[]> {
  if (!aiAvailable() || items.length === 0) return [];

  const slice = items.slice(0, MAX_ITEMS);
  const lines = slice.map((it, i) => {
    const notes = it.notes.slice(0, MAX_NOTES).map((n) => `"${n.slice(0, 140)}"`).join("; ");
    const r = it.reasons;
    return (
      `${i + 1}. id=${it.promotion_id} | comercio="${it.merchant}" | descuento=${it.discount ?? "?"}% | ` +
      `vence=${it.end_date ?? "sin fecha"} (hoy=${it.today}) | reportes=${it.count} ` +
      `[vencida:${r.expired}, desc_incorrecto:${r.wrong_discount}, no_existe:${r.not_found}, otro:${r.other}, sin_motivo:${r.unspecified}]` +
      (notes ? ` | notas: ${notes}` : "")
    );
  });

  const prompt =
    `Eres un asistente de moderación de una app de promociones bancarias chilenas. ` +
    `Recibes promociones con reportes de usuarios (posibles promos caducadas, con descuento ` +
    `incorrecto, o que ya no existen). Prioriza cuáles debe revisar/bajar el equipo primero.\n\n` +
    `Reglas:\n` +
    `- priority "high" si hay muchos reportes y/o la promo ya venció (end_date < hoy) y/o dominan ` +
    `motivos 'vencida'/'no_existe'.\n` +
    `- likely_dead=true si es muy probable que la promo ya no sea válida (vencida o reportes ` +
    `consistentes de que no existe).\n` +
    `- rationale: UNA línea breve en español explicando el porqué.\n\n` +
    `Promociones:\n${lines.join("\n")}\n\n` +
    `Responde estrictamente JSON con la forma:\n` +
    `{ "triage": [ { "promotion_id": "<id>", "priority": "high|med|low", "likely_dead": true, "rationale": "…" } ] }`;

  try {
    const out = await generateJSON<{ triage?: TriageResult[] }>(prompt);
    if (!out || !Array.isArray(out.triage)) return [];
    const valid = new Set(slice.map((s) => s.promotion_id));
    return out.triage.filter(
      (t): t is TriageResult =>
        !!t && typeof t.promotion_id === "string" && valid.has(t.promotion_id) &&
        (t.priority === "high" || t.priority === "med" || t.priority === "low"),
    );
  } catch (err) {
    console.warn("triageReports falló:", err instanceof Error ? err.message : err);
    return [];
  }
}
