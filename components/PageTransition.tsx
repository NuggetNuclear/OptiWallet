"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type Phase = "entering" | "holding" | "exiting" | "done";

interface PageTransitionProps {
  /** Target route to navigate to after the overlay animation */
  href?: string;
  /** If true, shows as a "landing" loader that exits once onReady is called */
  mode?: "navigate" | "arrive";
  /** Called when the exit animation finishes (arrive mode) */
  onComplete?: () => void;
}

/**
 * Branded full-screen transition overlay.
 *
 * Two modes:
 * - **navigate**: Fades in, shows shimmer, navigates to `href`, then fades out.
 * - **arrive**: Starts visible, fades out immediately (used on the target page
 *   once it's ready to render content).
 */
export function PageTransition({ href, mode = "navigate", onComplete }: PageTransitionProps) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>(mode === "navigate" ? "entering" : "holding");

  useEffect(() => {
    if (mode === "navigate") {
      // Precargar la ruta destino para que el swap sea instantáneo
      if (href) router.prefetch(href);
      // Phase 1: fade in (300ms)
      const t1 = setTimeout(() => setPhase("holding"), 300);
      // Phase 2: navegar manteniendo el overlay OPACO. No hay fase de salida
      // aquí: el push desmonta esta página (y el overlay con ella) mientras
      // la página destino ya está mostrando su propio overlay "arrive",
      // idéntico y también opaco → el empalme es invisible. Si saliéramos
      // antes del push, se vería el landing de nuevo + corte + re-aparición.
      const t2 = setTimeout(() => {
        if (href) router.push(href);
      }, 600);
      // Fallback: si a los 4s seguimos montados, la navegación no ocurrió
      // (push fallido / misma ruta) — salir con gracia en vez de quedar pegado.
      const t3 = setTimeout(() => setPhase("exiting"), 4000);
      const t4 = setTimeout(() => {
        setPhase("done");
        onComplete?.();
      }, 4350);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
        clearTimeout(t4);
      };
    }
    // arrive mode: fade out after a brief moment
    if (mode === "arrive") {
      const t1 = setTimeout(() => setPhase("exiting"), 150);
      const t2 = setTimeout(() => {
        setPhase("done");
        onComplete?.();
      }, 500);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
  }, [mode, href, router, onComplete]);

  if (phase === "done") return null;

  return (
    <div
      className={`page-transition-overlay ${phase === "entering" ? "entering" : ""} ${phase === "exiting" ? "exiting" : ""}`}
      aria-hidden="true"
    >
      {/* Logo */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <span
          className="pulse-dot"
          style={{
            width: "12px",
            height: "12px",
            borderRadius: "50%",
            background: "var(--lime)",
            boxShadow: "0 0 24px var(--lime)",
            display: "inline-block",
          }}
        />
        <span
          style={{
            fontFamily: "var(--font-fraunces), serif",
            fontWeight: 900,
            fontSize: "28px",
            letterSpacing: "-0.03em",
            color: "var(--ink)",
          }}
        >
          OptiWallet
        </span>
      </div>

      {/* Shimmer bar */}
      <div className="transition-shimmer" />

      {/* Tagline */}
      <span
        style={{
          fontFamily: "var(--font-jetbrains), monospace",
          fontSize: "11px",
          textTransform: "uppercase",
          letterSpacing: "0.18em",
          color: "var(--ink-dim)",
        }}
      >
        Paga con la tarjeta correcta
      </span>
    </div>
  );
}

/**
 * Hook for triggering the page transition from the landing page.
 * Returns the overlay element and a trigger function.
 */
export function usePageTransition() {
  const [target, setTarget] = useState<string | null>(null);

  const trigger = useCallback((href: string) => {
    setTarget(href);
  }, []);

  const onComplete = useCallback(() => setTarget(null), []);

  const overlay = target ? (
    <PageTransition href={target} mode="navigate" onComplete={onComplete} />
  ) : null;

  return { trigger, overlay };
}
