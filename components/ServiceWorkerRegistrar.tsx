// components/ServiceWorkerRegistrar.tsx
// Registra el SW y muestra un banner cuando hay una nueva versión disponible.
// "use client" porque usa hooks del browser.

"use client";

import { useServiceWorker } from "@/lib/hooks/use-service-worker";

export function ServiceWorkerRegistrar() {
  const { updateAvailable, applyUpdate, dismiss } = useServiceWorker();

  if (!updateAvailable) return null;

  return (
    <div
      id="sw-update-banner"
      role="alert"
      style={{
        position: "fixed",
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 9998,
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "12px 16px 12px 20px",
        borderRadius: "100px",
        background: "rgba(19, 22, 26, 0.92)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        border: "1px solid rgba(245, 241, 232, 0.12)",
        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.5)",
        fontFamily: "var(--font-sora), system-ui, sans-serif",
        fontSize: "13px",
        color: "var(--ink, #f5f1e8)",
        animation: "slideUp 0.4s ease-out forwards",
        maxWidth: "calc(100vw - 40px)",
      }}
    >
      <span
        style={{
          width: "6px",
          height: "6px",
          borderRadius: "50%",
          background: "var(--lime, #d4ff3a)",
          flexShrink: 0,
          animation: "pulseDot 2s ease-in-out infinite",
        }}
      />
      <span style={{ flex: 1, lineHeight: 1.4 }}>
        Nueva versión disponible
      </span>
      <button
        onClick={applyUpdate}
        style={{
          background: "var(--lime, #d4ff3a)",
          color: "var(--bg, #0b0d0c)",
          border: "none",
          borderRadius: "100px",
          padding: "7px 16px",
          fontSize: "12px",
          fontWeight: 600,
          cursor: "pointer",
          whiteSpace: "nowrap",
          transition: "transform 0.15s, box-shadow 0.15s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "translateY(-1px)";
          e.currentTarget.style.boxShadow = "0 4px 16px rgba(212, 255, 58, 0.3)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "none";
          e.currentTarget.style.boxShadow = "none";
        }}
      >
        Actualizar
      </button>
      <button
        onClick={dismiss}
        aria-label="Cerrar"
        style={{
          background: "none",
          border: "none",
          color: "var(--ink-dim, #9a958a)",
          cursor: "pointer",
          padding: "4px",
          fontSize: "16px",
          lineHeight: 1,
          transition: "color 0.15s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = "var(--ink, #f5f1e8)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = "var(--ink-dim, #9a958a)";
        }}
      >
        ✕
      </button>
    </div>
  );
}
