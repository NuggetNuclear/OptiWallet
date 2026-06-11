/** @type {import('next').NextConfig} */

// ─── Security headers ────────────────────────────────────────────────────────
// CSP nota: Next App Router hidrata con <script> inline, así que script-src
// necesita 'unsafe-inline' mientras no usemos nonces (los nonces vía proxy.ts
// forzarían render dinámico en todas las páginas y perderíamos el static
// optimization de la landing). Todo lo demás queda bloqueado: sin orígenes
// externos (fuentes self-hosted por next/font), sin embeds, sin frames.
const ContentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

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
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
