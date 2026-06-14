"use client";

import { useEffect, useRef } from "react";

interface Dep { id: string; name?: string }

interface DeleteModalProps {
  title: string;
  deps?: { label: string; items: Dep[] }[];
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

export function DeleteModal({ title, deps, onConfirm, onCancel, loading }: DeleteModalProps) {
  const hasDeps = deps?.some((d) => d.items.length > 0);
  const modalRef   = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Close on Escape and move focus into the dialog on open (basic a11y).
  useEffect(() => {
    confirmRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !loading) onCancel();
      // Rudimentary focus trap: keep Tab cycling within the modal.
      if (e.key === "Tab" && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last  = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault(); last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault(); first.focus();
        }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel, loading]);

  return (
    <div className="admin-modal-overlay" onClick={() => !loading && onCancel()}>
      <div
        ref={modalRef}
        className="admin-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="admin-modal-title" className="admin-modal-title">
          Eliminar {title}
        </h2>

        {hasDeps ? (
          <>
            <div className="admin-error">
              No puedes eliminar este registro mientras tenga dependencias. Elimina o reasigna los siguientes registros primero:
            </div>
            {deps!.filter((d) => d.items.length > 0).map((dep) => (
              <div key={dep.label} style={{ marginBottom: 12 }}>
                <p className="admin-label">{dep.label} ({dep.items.length})</p>
                <ul style={{ fontSize: 12, color: "var(--ink-dim)", paddingLeft: 16 }}>
                  {dep.items.slice(0, 10).map((item) => (
                    <li key={item.id}>{item.name ?? item.id}</li>
                  ))}
                  {dep.items.length > 10 && <li>…y {dep.items.length - 10} más</li>}
                </ul>
              </div>
            ))}
            <button ref={confirmRef} className="admin-btn admin-btn-ghost" onClick={onCancel} style={{ marginTop: 8 }}>
              Cerrar
            </button>
          </>
        ) : (
          <>
            <p style={{ fontSize: 13, color: "var(--ink-dim)", marginBottom: 24 }}>
              Esta acción no se puede deshacer.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button ref={confirmRef} className="admin-btn admin-btn-danger" onClick={onConfirm} disabled={loading}>
                {loading ? "Eliminando…" : "Sí, eliminar"}
              </button>
              <button className="admin-btn admin-btn-ghost" onClick={onCancel} disabled={loading}>
                Cancelar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
