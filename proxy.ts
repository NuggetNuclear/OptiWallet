// proxy.ts — convención de Next 16 (reemplaza a middleware.ts, hoy deprecado).
// Debe exportar una función llamada `proxy` (o default).

import { NextRequest, NextResponse } from "next/server";

/**
 * Redirección inteligente landing → app (lado server, sin flash).
 *
 * La cookie `ow_standalone` la setea <StandaloneRedirect /> la primera vez
 * que la landing se abre en modo standalone (PWA instalada). Desde ahí,
 * cualquier visita a `/` dentro de la PWA redirige acá mismo en el edge,
 * antes de renderizar nada.
 *
 * El matcher limita esto SOLO a `/`: ni API, ni assets, ni /app se tocan.
 */
export function proxy(req: NextRequest) {
  if (req.cookies.get("ow_standalone")?.value === "1") {
    const url = req.nextUrl.clone();
    url.pathname = "/app";
    return NextResponse.redirect(url, 307);
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/",
};
