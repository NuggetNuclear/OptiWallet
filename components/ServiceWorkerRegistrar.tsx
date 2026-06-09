// components/ServiceWorkerRegistrar.tsx
// Componente "invisible" — solo registra el SW, no renderiza nada.
// Necesita ser "use client" porque usa useEffect (hook del browser).

"use client";

import { useServiceWorker } from "@/lib/hooks/use-service-worker";

export function ServiceWorkerRegistrar() {
  useServiceWorker();
  return null;
}
