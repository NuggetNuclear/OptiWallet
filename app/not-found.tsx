// app/not-found.tsx — 404 con el branding de la app (en vez del default de Next).
// Server component: no necesita JS de cliente. Mismos tokens que app/error.tsx.

import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-copper">
        Error 404
      </div>
      <h1 className="mt-3 font-serif text-[34px] font-normal leading-[1.02] tracking-[-0.03em] text-ink">
        Esta página no<br />
        <em className="font-light text-lime">existe.</em>
      </h1>
      <p className="mt-4 max-w-sm text-sm leading-relaxed text-ink-dim">
        El enlace puede estar roto o la página se movió. Tu wallet sigue a salvo
        en este dispositivo.
      </p>
      <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
        <Link
          href="/app"
          className="btn-primary"
          style={{ width: "auto", padding: "14px 28px" }}
        >
          Ir a la app
        </Link>
        <Link
          href="/"
          className="rounded-full border border-line px-6 py-3 text-sm text-ink-dim transition-colors hover:border-lime hover:text-lime"
        >
          Volver al inicio
        </Link>
      </div>
    </div>
  );
}
