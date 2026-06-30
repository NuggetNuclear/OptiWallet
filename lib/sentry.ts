import type { ErrorEvent } from "@sentry/nextjs";

export const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

export const sharedSentryOptions = {
  dsn: SENTRY_DSN,
  enabled: Boolean(SENTRY_DSN),
  environment: process.env.NODE_ENV,
  release: "optiwallet@1.0.0-beta.2",
  // Privacidad primero (coherente con la política de la app):
  // sin IP, sin headers identificables, sin cookies.
  sendDefaultPii: false,
  beforeSend(event: ErrorEvent): ErrorEvent | null {
    if (typeof window !== "undefined") {
      try {
        if (window.location.pathname.startsWith("/admin")) {
          return null;
        }
      } catch {
        // Ignorar si no hay location
      }
    }
    const requestUrl = event.request?.url;
    if (requestUrl) {
      try {
        const path = new URL(requestUrl).pathname;
        if (path.startsWith("/admin") || path.startsWith("/api/admin")) {
          return null;
        }
      } catch {
        if (requestUrl.includes("/admin") || requestUrl.includes("/api/admin")) {
          return null;
        }
      }
    }
    return event;
  },
} as const;
