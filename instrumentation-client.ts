// instrumentation-client.ts — init de Sentry en el browser (US-ERR).
// Next.js carga este archivo automáticamente en el cliente.

import * as Sentry from "@sentry/nextjs";
import { sharedSentryOptions } from "@/lib/sentry";

Sentry.init({
  ...sharedSentryOptions,
  // Sin session replay ni tracing en el browser: solo captura de errores.
  // El tracing en cliente arrastra mucho código extra al bundle crítico
  // (TBT/LCP); las transacciones de API se trazan en el server.
  integrations: [],
});
