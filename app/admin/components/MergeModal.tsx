"use client";

import { useRef, useState } from "react";
import { useModalKeyboard } from "@/lib/hooks/use-modal-keyboard";

interface Option { id: string; label: string; emoji?: string | null }

interface MergeModalProps {
  /** Registro origen que será absorbido y eliminado. */
  source: Option;
  /** Palabra para los textos: "categoría" o "tag". */
  noun: string;
  /** Cuántos comercios se moverán (informativo). */
  merchantCount?: number;
  /** Destinos posibles (ya sin el origen). */
  options: Option[];
  onConfirm: (targetId: string) => void;
  onCancel: () => void;
  loading?: boolean;
}

export function MergeModal({ source, noun, merchantCount, options, onConfirm, onCancel, loading }: MergeModalProps) {
  const [target, setTarget] = useState("");
  const modalRef   = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  useModalKeyboard(modalRef, confirmRef, onCancel, loading);

  return (
    <div className="admin-modal-overlay" onClick={() => !loading && onCancel()}>
      <div
        ref={modalRef}
        className="admin-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-merge-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="admin-merge-title" className="admin-modal-title">
          Fusionar {source.emoji ? `${source.emoji} ` : ""}{source.label}
        </h2>
        <p style={{ fontSize: 13, color: "var(--ink-dim)", marginBottom: 16 }}>
          {merchantCount != null && merchantCount > 0
            ? `Los ${merchantCount} comercio(s) de esta ${noun} se moverán al destino y esta ${noun} se eliminará. `
            : `Esta ${noun} se eliminará y sus comercios se moverán al destino. `}
          Esta acción no se puede deshacer.
        </p>

        <div className="admin-form-row" style={{ marginBottom: 20 }}>
          <label className="admin-label">Fusionar en</label>
          <select className="admin-input" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">— Seleccionar destino —</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>{o.emoji ? `${o.emoji} ` : ""}{o.label}</option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button
            ref={confirmRef}
            className="admin-btn admin-btn-primary"
            onClick={() => target && onConfirm(target)}
            disabled={loading || !target}
          >
            {loading ? "Fusionando…" : "Fusionar"}
          </button>
          <button className="admin-btn admin-btn-ghost" onClick={onCancel} disabled={loading}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}
