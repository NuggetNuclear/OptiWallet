// lib/sentry.ts — opciones compartidas de Sentry (US-ERR).
// Sin DSN (env NEXT_PUBLIC_SENTRY_DSN) el SDK queda deshabilitado: cero
// requests, cero overhead. Para activarlo basta setear la variable en Vercel.

export const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

export const sharedSentryOptions = {
  dsn: SENTRY_DSN,
  enabled: Boolean(SENTRY_DSN),
  environment: process.env.NODE_ENV,
  release: "optiwallet@0.1.0-beta",
  // Privacidad primero (coherente con la política de la app):
  // sin IP, sin headers identificables, sin cookies.
  sendDefaultPii: false,
  // OJO: tracesSampleRate NO va acá. En el cliente activaría el código de
  // tracing (~decenas de KB que pegan al TBT); solo se setea en server/edge.
} as const;
