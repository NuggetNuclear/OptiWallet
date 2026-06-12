// instrumentation.ts — hook de instrumentación de Next.js (US-ERR).
// Carga la config de Sentry según el runtime y reporta errores de
// requests (API routes, server components) automáticamente.

import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
