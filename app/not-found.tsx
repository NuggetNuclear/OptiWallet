// app/not-found.tsx — 404 con el branding premium de la landing.
// Server component: no necesita JS de cliente.
// Diseño coherente con error.tsx + glows decorativos del landing.

import Link from "next/link";

export default function NotFound() {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6 text-center">
      {/* Glows decorativos — mismos que la landing */}
      <div
        className="glow-plum"
        style={{ top: "-10%", left: "-15%", width: "500px", height: "500px" }}
      />
      <div
        className="glow-lime"
        style={{ bottom: "-20%", right: "-10%", width: "400px", height: "400px", opacity: 0.5 }}
      />

      {/* Contenido principal con stagger */}
      <div className="stagger-children relative z-10">
        {/* 404 grande decorativo */}
        <div
          className="font-serif font-light leading-none tracking-[-0.04em]"
          style={{
            fontSize: "clamp(100px, 20vw, 180px)",
            color: "transparent",
            WebkitTextStroke: "1.5px var(--line-strong)",
            userSelect: "none",
          }}
        >
          404
        </div>

        {/* Tag mono */}
        <div className="mt-4 font-mono text-[11px] uppercase tracking-[0.2em] text-copper">
          Página no encontrada
        </div>

        {/* Heading */}
        <h1 className="mt-4 font-serif text-[34px] font-normal leading-[1.02] tracking-[-0.03em] text-ink">
          Esta página no<br />
          <em className="font-light text-lime">existe.</em>
        </h1>

        {/* Descripción */}
        <p className="mx-auto mt-4 max-w-sm text-sm leading-relaxed text-ink-dim">
          El enlace puede estar roto o la página se movió.
          Tu wallet sigue a salvo en este dispositivo.
        </p>

        {/* Separador */}
        <div className="dashed-line mx-auto mt-8 max-w-[120px]" />

        {/* CTAs */}
        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/app"
            id="not-found-cta-app"
            className="btn-primary"
            style={{ width: "auto", padding: "14px 28px" }}
          >
            Ir a la app
          </Link>
          <Link
            href="/"
            id="not-found-cta-home"
            className="btn-ghost"
            style={{ padding: "14px 24px" }}
          >
            Volver al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}
