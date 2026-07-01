// components/OfflineBanner.tsx
// Avisa cuando el navegador pierde conexión — hasta ahora el Service Worker
// servía la cache silenciosamente sin ningún indicador visual (ver
// docs/SECURITY.md → Recomendaciones operativas → "UI offline").
// "use client" porque usa hooks del browser.

"use client";

import { useOnlineStatus } from "@/lib/hooks/use-online-status";

export function OfflineBanner() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      id="offline-banner"
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "8px",
        padding: "8px var(--page-px, 20px)",
        paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
        background: "var(--copper, #d67846)",
        color: "var(--bg, #0b0d0c)",
        fontFamily: "var(--font-sora), system-ui, sans-serif",
        fontSize: "13px",
        fontWeight: 600,
        textAlign: "center",
        animation: "slideDown 0.3s ease-out forwards",
      }}
    >
      <span
        aria-hidden
        style={{
          width: "6px",
          height: "6px",
          borderRadius: "50%",
          background: "var(--bg, #0b0d0c)",
          flexShrink: 0,
        }}
      />
      Sin conexión — mostrando datos guardados
    </div>
  );
}
