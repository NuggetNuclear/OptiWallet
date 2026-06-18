"use client";

import { useEffect, useRef } from "react";

interface ConfirmModalProps {
  title: string;
  description: string;
  confirmText: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

export function ConfirmModal({
  title,
  description,
  confirmText,
  cancelText = "Cancelar",
  onConfirm,
  onCancel,
  loading,
}: ConfirmModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !loading) onCancel();
      // Focus cycling within the modal.
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
        aria-labelledby="admin-confirm-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="admin-confirm-modal-title" className="admin-modal-title">
          {title}
        </h2>
        <p style={{ fontSize: 13, color: "var(--ink-dim)", marginBottom: 24, lineHeight: "1.4" }}>
          {description}
        </p>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            ref={confirmRef}
            className="admin-btn admin-btn-primary"
            style={{ backgroundColor: "var(--lime)", color: "#000" }}
            onClick={onConfirm}
            disabled={loading}
          >
            {confirmText}
          </button>
          <button className="admin-btn admin-btn-ghost" onClick={onCancel} disabled={loading}>
            {cancelText}
          </button>
        </div>
      </div>
    </div>
  );
}
