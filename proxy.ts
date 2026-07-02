// proxy.ts — convención de Next 16 (reemplaza a middleware.ts, hoy deprecado).
// Debe exportar una función llamada `proxy` (o default).

import { NextRequest, NextResponse } from "next/server";
import { isMaintenanceMode } from "@/lib/maintenance";

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ── 0. Maintenance mode ───────────────────────────────────────────────────
  // La página /mantencion misma se excluye para no crear un loop.
  const isMaintenancePage = pathname === "/mantencion";
  const isAsset = pathname.startsWith("/_next") || pathname.startsWith("/favicon") || pathname === "/manifest.json";

  if (!isMaintenancePage && !isAsset) {
    const maintenance = await isMaintenanceMode();
    if (maintenance) {
      const url = req.nextUrl.clone();
      url.pathname = "/mantencion";
      return NextResponse.redirect(url, 307);
    }
  }

  // ── 1. PWA standalone redirect (landing → /app) ───────────────────────────
  // La cookie `ow_standalone` la setea <StandaloneRedirect /> la primera vez
  // que la landing se abre en modo standalone (PWA instalada). Desde ahí,
  // cualquier visita a `/` dentro de la PWA redirige al /app en el edge,
  // antes de renderizar nada.
  if (pathname === "/" && req.cookies.get("ow_standalone")?.value === "1") {
    const url = req.nextUrl.clone();
    url.pathname = "/app";
    return NextResponse.redirect(url, 307);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/app/:path*",
    "/blog/:path*",
    "/sobre-nosotros/:path*",
    "/contacto/:path*",
    "/privacidad/:path*",
    "/terminos/:path*",
    "/cookies/:path*",
    "/prensa/:path*",
    "/roadmap/:path*",
    "/api-docs/:path*",
    "/mantencion",
  ],
};

