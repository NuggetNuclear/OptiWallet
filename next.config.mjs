/** @type {import('next').NextConfig} */

import { withSentryConfig } from "@sentry/nextjs";

// ─── Security headers ────────────────────────────────────────────────────────
// CSP nota: Next App Router hidrata con <script> inline, así que script-src
// necesita 'unsafe-inline' mientras no usemos nonces (los nonces vía proxy.ts
// forzarían render dinámico en todas las páginas y perderíamos el static
// optimization de la landing). Orígenes externos permitidos (Sprint 2):
//  - https://plausible.io        → script de analytics + endpoint de eventos (US-ANA)
//  - https://*.ingest.*.sentry.io → envío de errores a Sentry (US-ERR)
// Todo lo demás queda bloqueado: fuentes self-hosted por next/font, sin
// embeds, sin frames. Swagger UI (/api-docs) es self-hosted en /public/swagger.
//
// ⚠️ IMPORTANTE — Plausible self-hosted / dominio custom:
// `script-src` y `connect-src` de abajo asumen el host oficial `plausible.io`.
// Si usas `NEXT_PUBLIC_PLAUSIBLE_SRC` apuntando a OTRO host (Plausible
// self-hosted o proxy), DEBES agregar ese origen a AMBAS directivas o el
// navegador bloqueará silenciosamente el script y el envío de eventos —
// analytics deja de registrar sin ningún error visible. El bloque de abajo
// emite un warning en el build de Vercel si detecta un host no cubierto.
const ContentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://plausible.io",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self' https://plausible.io https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://*.ingest.de.sentry.io",
  "manifest-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

// Build-time guard: si NEXT_PUBLIC_PLAUSIBLE_SRC apunta a un host que la CSP no
// permite, el script de analytics se bloquearía silenciosamente en producción.
// Avisamos en el log del build (Vercel/CI) para que se agregue el origen arriba.
if (process.env.NEXT_PUBLIC_PLAUSIBLE_SRC) {
  try {
    const host = new URL(process.env.NEXT_PUBLIC_PLAUSIBLE_SRC).host;
    if (!ContentSecurityPolicy.includes(host)) {
      console.warn(
        `\n⚠️  CSP: NEXT_PUBLIC_PLAUSIBLE_SRC usa el host "${host}", que NO está en script-src/connect-src.\n` +
        `    El navegador bloqueará Plausible. Agrega "https://${host}" a ambas directivas en next.config.mjs.\n`,
      );
    }
  } catch {
    console.warn("⚠️  NEXT_PUBLIC_PLAUSIBLE_SRC no es una URL válida:", process.env.NEXT_PUBLIC_PLAUSIBLE_SRC);
  }
}

const securityHeaders = [
  { key: "Content-Security-Policy", value: ContentSecurityPolicy },
  // 2 años + subdominios. Vercel ya lo manda en *.vercel.app,
  // pero declararlo acá cubre dominios custom futuros.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Redundante con frame-ancestors, pero cubre browsers legacy.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // No usamos ninguna de estas APIs — denegarlas explícitamente.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    // Inlinea el CSS como <style> en el HTML (solo en build de producción).
    // Elimina los 2 stylesheets render-blocking → mejora directa de LCP.
    // Nuestro CSS es chico (~15KB), así que perder su caché no duele.
    inlineCss: true,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

// ─── Sentry sourcemaps ────────────────────────────────────────────────────────
// withSentryConfig sube los sourcemaps a Sentry en cada build de producción,
// lo que permite stack traces legibles en el dashboard (nombres reales de
// funciones y líneas exactas en vez de código minificado).
//
// Requisitos para que los mapas se suban:
//   - SENTRY_AUTH_TOKEN en .env.local o en Vercel env vars (Internal Integration token)
//   - NEXT_PUBLIC_SENTRY_DSN para que el SDK esté activo
//   - "Release" creado automáticamente por withSentryConfig desde el git commit hash
//
// Sin SENTRY_AUTH_TOKEN la build completa de todas formas — solo omite el upload.
// tunnelRoute: redirige los eventos de error por nuestro propio dominio para
// evitar que adblockers bloqueen las llamadas a *.ingest.sentry.io.

export default withSentryConfig(nextConfig, {
  // Organización y proyecto en sentry.io (para el upload de sourcemaps).
  // Setear SENTRY_ORG y SENTRY_PROJECT en .env.local o en Vercel env vars.
  org:     process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Silenciar logs del plugin en builds normales (aparecen en CI)
  silent: !process.env.CI,

  // Subir sourcemaps a Sentry y borrarlos del bundle de producción
  // (no exponer el código fuente en el bundle público)
  widenClientFileUpload: true,

  // Tuneliza los eventos de Sentry por /monitoring para evitar adblockers
  tunnelRoute: "/monitoring",

  // Ocultar la anotación de sourcemap en el bundle final
  hideSourceMaps: true,

  // Deshabilitar el logger de Sentry (reducir bundle size ~3.5KB)
  disableLogger: true,

  // Deshabilitar el automatic instrumentation de Vercel Cron Jobs (no lo usamos)
  automaticVercelMonitors: false,
});
