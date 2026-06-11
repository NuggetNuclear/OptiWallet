"use client";

import { useEffect } from "react";
import { syncStandaloneCookie } from "@/lib/standalone";

/**
 * Mantiene la cookie `ow_standalone` sincronizada con el modo real de
 * ejecución, en todas las páginas (montado en el root layout).
 * Ver lib/standalone.ts para el diseño completo. No renderiza nada.
 */
export function StandaloneCookieSync() {
  useEffect(() => {
    syncStandaloneCookie();
  }, []);

  return null;
}
