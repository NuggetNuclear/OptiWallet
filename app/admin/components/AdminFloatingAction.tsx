"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Wraps the primary action button that sits top-right in .admin-header
 * (p.ej. "+ Nueva promo", "+ Nueva categoría"). Cuando el usuario baja y el
 * header sale de la vista, el botón hace un "graceful exit": deja de estar
 * anclado al header y pasa a flotar fijo en la misma posición aproximada de
 * pantalla, con una animación sutil de entrada. Al volver arriba, vuelve a
 * su lugar en el header sin dejar un salto de layout (se reserva un espacio
 * invisible del mismo tamaño mientras flota).
 */
export function AdminFloatingAction({
  children,
  threshold = 48,
}: {
  children: React.ReactNode;
  threshold?: number;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [floating, setFloating] = useState(false);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    function measure() {
      const el = wrapRef.current?.firstElementChild as HTMLElement | null;
      if (el) setSize({ w: el.offsetWidth, h: el.offsetHeight });
    }
    function onScroll() {
      measure();
      setFloating(window.scrollY > threshold);
    }
    measure();
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", measure);
    };
  }, [threshold]);

  return (
    <>
      {floating && size && (
        <div aria-hidden="true" style={{ width: size.w, height: size.h }} />
      )}
      <div
        ref={wrapRef}
        className={`admin-floating-action${floating ? " is-floating" : ""}`}
        style={floating && size ? { width: size.w } : undefined}
      >
        {children}
      </div>
    </>
  );
}
