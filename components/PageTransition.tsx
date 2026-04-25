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
      // Phase 1: fade in (300ms)
      const t1 = setTimeout(() => setPhase("holding"), 300);
      // Phase 2: hold + navigate (600ms after fade-in)
      const t2 = setTimeout(() => {
        if (href) router.push(href);
        setPhase("exiting");
      }, 900);
      // Phase 3: done (after exit animation)
      const t3 = setTimeout(() => {
        setPhase("done");
        onComplete?.();
      }, 1250);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
      };
    }
    // arrive mode: fade out after a brief moment
    if (mode === "arrive") {
      const t1 = setTimeout(() => setPhase("exiting"), 100);
      const t2 = setTimeout(() => {
        setPhase("done");
        onComplete?.();
      }, 450);
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

  const overlay = target ? (
    <PageTransition href={target} mode="navigate" onComplete={() => setTarget(null)} />
  ) : null;

  return { trigger, overlay };
}
