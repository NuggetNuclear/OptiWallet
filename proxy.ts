// proxy.ts — convención de Next 16 (reemplaza a middleware.ts, hoy deprecado).
// Debe exportar una función llamada `proxy` (o default).

import { NextRequest, NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/admin-session";
import { isMaintenanceMode } from "@/lib/maintenance";

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ── 0. Maintenance mode ───────────────────────────────────────────────────
  // El admin panel y sus APIs quedan SIEMPRE accesibles para poder desactivarlo.
  // La página /mantencion misma también se excluye para no crear un loop.
  const isAdminRoute = pathname.startsWith("/admin") || pathname.startsWith("/api/admin");
  const isMaintenancePage = pathname === "/mantencion";
  const isAsset = pathname.startsWith("/_next") || pathname.startsWith("/favicon") || pathname === "/manifest.json";

  if (!isAdminRoute && !isMaintenancePage && !isAsset) {
    const maintenance = await isMaintenanceMode();
    if (maintenance) {
      const url = req.nextUrl.clone();
      url.pathname = "/mantencion";
      return NextResponse.redirect(url, 307);
    }
  }

  // ── 1. Admin auth guard ───────────────────────────────────────────────────
  // Rutas admin que NO requieren sesión válida
  const adminPublic = ["/admin/login"];
  // Rutas admin que requieren sesión pero NO exigen totp_enabled (setup inicial)
  const adminTotpSetup = ["/admin/totp-setup"];

  if (pathname.startsWith("/admin")) {
    if (!adminPublic.includes(pathname)) {
      const session = await getAdminFromRequest(req);
      if (!session) {
        const url = req.nextUrl.clone();
        url.pathname = "/admin/login";
        return NextResponse.redirect(url, 307);
      }
      // Fuerza TOTP setup si el admin aún no lo ha configurado
      if (!session.totp_enabled && !adminTotpSetup.some((p) => pathname.startsWith(p))) {
        const url = req.nextUrl.clone();
        url.pathname = "/admin/totp-setup";
        return NextResponse.redirect(url, 307);
      }
    }
  }

  // ── 2. PWA standalone redirect (landing → /app) ───────────────────────────
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
  // Extendemos el matcher para cubrir todas las rutas de la app pública
  // además de las rutas admin (el guard de admin ya estaba).
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
    "/admin/:path*",
  ],
};

