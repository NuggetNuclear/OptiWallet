// sentry.edge.config.ts — init de Sentry en el runtime Edge (proxy.ts) (US-ERR).
// Importado por instrumentation.ts.

import * as Sentry from "@sentry/nextjs";
import { sharedSentryOptions } from "@/lib/sentry";

Sentry.init({
  ...sharedSentryOptions,
  // Beta con poco tráfico: muestrear todo. Bajar cuando crezca.
  tracesSampleRate: 1.0,
});
