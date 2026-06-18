"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { isStandalone } from "@/lib/standalone";

/**
 * Fallback client-side de la redirección landing → app.
 *
 * El server no puede detectar standalone (iOS no envía ningún header),
 * así que este componente cubre los casos donde proxy.ts no alcanza:
 *  - Primera visita standalone (la cookie aún no existe).
 *  - Offline: el service worker sirve la landing cacheada sin pasar
 *    por el middleware.
 *
 * La cookie la maneja <StandaloneCookieSync /> (root layout).
 * Montar SOLO en la landing. No renderiza nada.
 */
export function StandaloneRedirect() {
  const router = useRouter();

  useEffect(() => {
    if (isStandalone()) {
      router.replace("/app");
    }
  }, [router]);

  return null;
}
