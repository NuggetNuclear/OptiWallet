import type { ReactNode } from "react";

interface TopBarProps {
  /** Contenido izquierdo (logo, botón volver, etc.) */
  left: ReactNode;
  /** Contenido derecho (acciones, contadores, etc.) */
  right?: ReactNode;
  /**
   * - `bar` (default): sticky, con borde inferior y blur — el header estándar.
   * - `plain`: en flujo normal, sin borde ni blur (ej: barra "Volver" de WalletSetup).
   */
  variant?: "bar" | "plain";
  /** true → sin padding horizontal (para usar dentro de contenedores ya con padding) */
  flush?: boolean;
  className?: string;
}

/**
 * Barra superior única de la app.
 *
 * Única dueña del safe-area superior de iOS (notch / Dynamic Island):
 * todo header debe pasar por aquí en vez de duplicar paddings con
 * env(safe-area-inset-top). Para un rediseño, se restyling-ea este
 * componente y cambian todas las pantallas a la vez.
 *
 * Los valores vienen de los layout tokens en globals.css
 * (--topbar-pad-top, --topbar-pad-y, --page-px).
 */
export function TopBar({ left, right, variant = "bar", flush = false, className = "" }: TopBarProps) {
  const chrome =
    variant === "bar"
      ? "sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur-xl"
      : "relative z-10";

  return (
    <header
      className={`flex items-center justify-between ${chrome} ${className}`}
      style={{
        paddingTop: "var(--topbar-pad-top)",
        paddingBottom: "var(--topbar-pad-y)",
        paddingLeft: flush ? undefined : "var(--page-px)",
        paddingRight: flush ? undefined : "var(--page-px)",
      }}
    >
      {left}
      {right}
    </header>
  );
}
