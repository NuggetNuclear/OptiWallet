// app/mantencion/page.tsx — Pantalla de mantenimiento.
// Server component: no requiere JS de cliente.
// Diseño basado en not-found.tsx — misma estética premium.

export const metadata = {
  title: "En mantenimiento · OptiWallet",
  description: "Estamos haciendo mejoras. Vuelve pronto.",
  robots: { index: false, follow: false },
};

export default function MaintenancePage() {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6 text-center">
      {/* Glows decorativos */}
      <div
        className="glow-plum"
        style={{ top: "-10%", left: "-15%", width: "500px", height: "500px" }}
      />
      <div
        className="glow-lime"
        style={{ bottom: "-20%", right: "-10%", width: "400px", height: "400px", opacity: 0.4 }}
      />

      <div className="stagger-children relative z-10">
        {/* Ícono / número decorativo */}
        <div
          className="font-serif font-light leading-none tracking-[-0.04em]"
          style={{
            fontSize: "clamp(80px, 18vw, 160px)",
            color: "transparent",
            WebkitTextStroke: "1.5px var(--line-strong)",
            userSelect: "none",
          }}
        >
          🔧
        </div>

        {/* Tag mono */}
        <div className="mt-4 font-mono text-[11px] uppercase tracking-[0.2em] text-copper">
          Mantenimiento programado
        </div>

        {/* Heading */}
        <h1 className="mt-4 font-serif text-[32px] font-normal leading-[1.02] tracking-[-0.03em] text-ink">
          Estamos mejorando<br />
          <em className="font-light text-lime">OptiWallet.</em>
        </h1>

        {/* Descripción */}
        <p className="mx-auto mt-4 max-w-sm text-sm leading-relaxed text-ink-dim">
          Estamos haciendo actualizaciones para mejorar tu experiencia.
          Vuelve en unos minutos — tu wallet sigue guardada en este dispositivo.
        </p>

        {/* Separador */}
        <div className="dashed-line mx-auto mt-8 max-w-[120px]" />

        {/* Estado */}
        <div className="mt-8 flex items-center justify-center gap-2">
          <span className="pulse-dot h-2 w-2 rounded-full bg-lime" />
          <span className="font-mono text-[11px] uppercase tracking-widest text-ink-dim">
            Volvemos pronto
          </span>
        </div>
      </div>
    </div>
  );
}
