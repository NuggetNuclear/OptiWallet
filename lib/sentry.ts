export const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

export const sharedSentryOptions = {
  dsn: SENTRY_DSN,
  enabled: Boolean(SENTRY_DSN),
  environment: process.env.NODE_ENV,
  release: "optiwallet@1.0.0-beta.2",
  // Privacidad primero (coherente con la política de la app):
  // sin IP, sin headers identificables, sin cookies.
  sendDefaultPii: false,
} as const;
