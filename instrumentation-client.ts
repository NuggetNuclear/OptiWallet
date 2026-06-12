// instrumentation-client.ts — init de Sentry en el browser (US-ERR).
// Next.js carga este archivo automáticamente en el cliente.

import * as Sentry from "@sentry/nextjs";
import { sharedSentryOptions } from "@/lib/sentry";

Sentry.init({
  ...sharedSentryOptions,
  // Sin session replay: evita peso extra en el bundle y datos de más.
  integrations: [],
});

// Instrumenta las navegaciones del App Router como transacciones.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
