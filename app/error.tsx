"use client";

// app/error.tsx — Error boundary global (US-ERR).
// Captura errores de render en cualquier ruta bajo el root layout,
// los reporta a Sentry y muestra una pantalla de recuperación con
// el branding de la app en vez del overlay genérico.

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
    console.error("[OptiWallet] Error boundary:", error);
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-copper">
        Algo se rompió
      </div>
      <h1 className="mt-3 font-serif text-[34px] font-normal leading-[1.02] tracking-[-0.03em] text-ink">
        Esto no debía<br />
        <em className="font-light text-lime">pasar.</em>
      </h1>
      <p className="mt-4 max-w-sm text-sm leading-relaxed text-ink-dim">
        Ya registramos el error para arreglarlo. Puedes reintentar o volver
        al inicio — tu wallet está a salvo en este dispositivo.
      </p>
      {error.digest && (
        <p className="mt-3 font-mono text-[10px] uppercase tracking-widest text-ink-dim">
          ref: {error.digest}
        </p>
      )}
      <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
        <button onClick={reset} className="btn-primary" style={{ width: "auto", padding: "14px 28px" }}>
          Reintentar
        </button>
        <a
          href="/app"
          className="rounded-full border border-line px-6 py-3 text-sm text-ink-dim transition-colors hover:border-lime hover:text-lime"
        >
          Ir al inicio
        </a>
      </div>
    </div>
  );
}
