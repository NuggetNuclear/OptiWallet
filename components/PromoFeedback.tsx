"use client";

import { useRef, useState } from "react";
import { events } from "@/lib/analytics";
import {
  createPromoReport,
  updatePromoReport,
  type PromoReportReason,
  type PromoReportRef,
} from "@/lib/api-client";

// Reveladas tras 👎. El reporte YA se creó en ese momento; el motivo solo lo refina.
const REASONS: { slug: PromoReportReason; label: string }[] = [
  { slug: "expired", label: "ya venció" },
  { slug: "wrong_discount", label: "descuento incorrecto" },
  { slug: "not_found", label: "no existe" },
  { slug: "other", label: "otro" },
];

type Tone = "onColor" | "onSurface";

const TONE = {
  onColor: {
    label: "text-white/60",
    thanks: "text-white/90",
    chip: "border-white/20 bg-white/10 text-white hover:bg-white/20",
    input: "bg-white/10 text-white placeholder-white/40 border-white/20 focus:border-white/50",
    send: "bg-white/20 text-white hover:bg-white/30",
  },
  onSurface: {
    label: "text-ink-dim",
    thanks: "text-ink-dim/90",
    chip: "border-line bg-bg-3 text-ink hover:border-line-strong",
    input: "bg-bg-3 text-ink placeholder-ink-dim/50 border-line focus:border-lime",
    send: "bg-bg-3 text-ink hover:border-line-strong border border-line",
  },
} as const;

interface PromoFeedbackProps {
  promotionId: string;
  merchantId: string;
  bankId: string;
  tone: Tone;
}

/**
 * Bloque 👍/👎 compartido por RecommendationCard y GroupedAlternativeCard.
 * Captura en dos fases: 👎 crea el reporte al instante (así nunca se pierde) y
 * luego ofrece un selector de motivo opcional que lo refina.
 */
export function PromoFeedback({ promotionId, merchantId, bankId, tone }: PromoFeedbackProps) {
  const t = TONE[tone];
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);
  const [reason, setReason] = useState<PromoReportReason | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");

  // La referencia {id, token} del reporte llega de forma asíncrona tras el POST
  // del 👎. Si el usuario elige un motivo antes de que resuelva, lo guardamos como
  // "pendiente" y lo enviamos en cuanto la referencia esté disponible — así el
  // motivo nunca se pierde y no termina como "sin motivo" en el panel.
  const reportRef = useRef<PromoReportRef | null>(null);
  const pendingRef = useRef<{ reason: PromoReportReason; note?: string } | null>(null);

  function flushReason(ref: PromoReportRef | null) {
    if (ref === null || !pendingRef.current) return;
    const { reason: r, note: n } = pendingRef.current;
    pendingRef.current = null;
    updatePromoReport(ref, r, n);
  }

  function submitReason(r: PromoReportReason, n?: string) {
    if (reportRef.current !== null) updatePromoReport(reportRef.current, r, n);
    else pendingRef.current = { reason: r, note: n };
  }

  function sendPlausible(kind: "up" | "down") {
    events.promotionFeedback({ promotionId, merchantId, bankId, feedback: kind });
  }

  function onUp(e: React.MouseEvent) {
    e.stopPropagation();
    setFeedback("up");
    sendPlausible("up");
  }

  async function onDown(e: React.MouseEvent) {
    e.stopPropagation();
    setFeedback("down");
    sendPlausible("down");
    const ref = await createPromoReport({ promotionId, merchantId, bankId });
    reportRef.current = ref;
    flushReason(ref); // por si el usuario ya eligió motivo mientras esperábamos la referencia
  }

  function pickReason(e: React.MouseEvent, slug: PromoReportReason) {
    e.stopPropagation();
    setReason(slug);
    if (slug === "other") {
      setNoteOpen(true);
      return;
    }
    submitReason(slug);
  }

  function sendNote(e: React.MouseEvent) {
    e.stopPropagation();
    submitReason("other", note.trim() || undefined);
    setNoteOpen(false);
  }

  // ── 👍 ──
  if (feedback === "up") {
    return <span className={`font-mono text-[10px] ${t.thanks}`}>¡Gracias! 👍</span>;
  }

  // ── 👎 → selector de motivo / nota / agradecimiento ──
  if (feedback === "down") {
    if (reason && !noteOpen) {
      return <span className={`font-mono text-[10px] ${t.thanks}`}>Gracias, lo revisamos 👎</span>;
    }
    if (noteOpen) {
      return (
        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="¿Qué pasó? (opcional)"
            maxLength={280}
            className={`w-40 rounded-full border px-2.5 py-1 text-[11px] outline-none ${t.input}`}
          />
          <button
            type="button"
            onClick={sendNote}
            className={`rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors ${t.send}`}
          >
            Enviar
          </button>
        </div>
      );
    }
    return (
      <div className="flex flex-wrap items-center justify-end gap-1">
        <span className={`font-mono text-[9px] uppercase tracking-wider ${t.label}`}>¿Qué pasó?</span>
        {REASONS.map((r) => (
          <button
            key={r.slug}
            type="button"
            onClick={(e) => pickReason(e, r.slug)}
            className={`rounded-full border px-2 py-0.5 text-[10px] transition-colors ${t.chip}`}
          >
            {r.label}
          </button>
        ))}
      </div>
    );
  }

  // ── estado inicial ──
  return (
    <>
      <span className={`font-mono text-[9px] uppercase tracking-wider ${t.label}`}>¿Te sirvió?</span>
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={onUp}
          className="cursor-pointer p-0.5 transition hover:scale-110 active:scale-95"
          title="Sí, me sirvió"
        >
          👍
        </button>
        <button
          type="button"
          onClick={onDown}
          className="cursor-pointer p-0.5 transition hover:scale-110 active:scale-95"
          title="No me sirvió / reportar"
        >
          👎
        </button>
      </div>
    </>
  );
}
