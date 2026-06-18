"use client";

import { useEffect, type RefObject } from "react";

const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Handles two standard modal keyboard behaviours:
 * - Escape closes the modal (unless `loading` is true).
 * - Tab cycles focus within `modalRef` (basic focus trap).
 *
 * Also focuses `initialFocusRef` on mount.
 */
export function useModalKeyboard(
  modalRef: RefObject<HTMLElement | null>,
  initialFocusRef: RefObject<HTMLElement | null>,
  onCancel: () => void,
  loading?: boolean,
) {
  useEffect(() => {
    initialFocusRef.current?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !loading) {
        onCancel();
        return;
      }
      if (e.key === "Tab" && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(FOCUSABLE);
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last  = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [modalRef, initialFocusRef, onCancel, loading]);
}
