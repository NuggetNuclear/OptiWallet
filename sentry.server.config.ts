// sentry.server.config.ts — init de Sentry en el runtime Node (US-ERR).
// Importado por instrumentation.ts.

import * as Sentry from "@sentry/nextjs";
import { sharedSentryOptions } from "@/lib/sentry";

Sentry.init(sharedSentryOptions);
