"use client";

import { useRef } from "react";
import { useModalKeyboard } from "@/lib/hooks/use-modal-keyboard";

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
  useModalKeyboard(modalRef, confirmRef, onCancel, loading);

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
