import type { ReactNode } from "react";

/**
 * Dock inferior fijo (CTAs flotantes, etc.).
 *
 * Única dueña del safe-area inferior de iOS (home indicator):
 * cualquier elemento pegado al borde inferior debe pasar por aquí.
 * Valores desde los layout tokens en globals.css
 * (--dock-pad-bottom, --dock-pad-y, --page-px).
 */
export function BottomDock({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-20 border-t border-line bg-bg/90 backdrop-blur-xl ${className}`}
      style={{
        paddingTop: "var(--dock-pad-y)",
        paddingBottom: "var(--dock-pad-bottom)",
        paddingLeft: "var(--page-px)",
        paddingRight: "var(--page-px)",
      }}
    >
      {children}
    </div>
  );
}
