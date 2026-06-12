"use client";

// app/global-error.tsx — Último recurso (US-ERR).
// Solo se activa si el error ocurre en el ROOT layout (app/error.tsx cubre
// todo lo demás). Debe renderizar <html> y <body> propios porque el layout
// raíz murió — por lo mismo, estilos inline: globals.css podría no existir.

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
    console.error("[OptiWallet] Global error boundary:", error);
  }, [error]);

  return (
    <html lang="es-CL">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "16px",
          background: "#0b120e",
          color: "#f2f1ec",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
          padding: "24px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span
            style={{
              width: "10px",
              height: "10px",
              borderRadius: "50%",
              background: "#4caf7d",
              display: "inline-block",
            }}
          />
          <strong style={{ fontSize: "20px", letterSpacing: "-0.02em" }}>OptiWallet</strong>
        </div>
        <h1 style={{ fontSize: "22px", fontWeight: 500, margin: 0 }}>
          Algo se rompió de verdad.
        </h1>
        <p style={{ maxWidth: "380px", fontSize: "14px", lineHeight: 1.6, opacity: 0.7, margin: 0 }}>
          Ya registramos el error. Recarga la página para continuar — tu wallet
          está guardada en este dispositivo.
        </p>
        {error.digest && (
          <code style={{ fontSize: "11px", opacity: 0.5 }}>ref: {error.digest}</code>
        )}
        <button
          onClick={() => window.location.reload()}
          style={{
            marginTop: "8px",
            background: "#4caf7d",
            color: "#0b120e",
            border: "none",
            borderRadius: "999px",
            padding: "14px 32px",
            fontSize: "15px",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Recargar
        </button>
      </body>
    </html>
  );
}
