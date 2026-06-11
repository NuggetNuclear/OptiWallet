// lib/hooks/use-service-worker.ts
// Hook que registra el Service Worker una sola vez al montar la app.
// Se importa en app/layout.tsx

import { useEffect } from "react";

export function useServiceWorker() {
  useEffect(() => {
    // Solo en producción y si el browser soporta SW
    if (
      process.env.NODE_ENV !== "production" ||
      typeof window === "undefined" ||
      !("serviceWorker" in navigator)
    ) {
      return;
    }

    const registerSW = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });

        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener("statechange", () => {
            if (
              newWorker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              // Hay una nueva versión disponible.
              // Por ahora solo logueamos — en Sprint 3 podemos mostrar un banner.
              console.info("[OptiWallet SW] Nueva versión disponible.");
            }
          });
        });

        console.info("[OptiWallet SW] Registrado:", registration.scope);
      } catch (error) {
        console.error("[OptiWallet SW] Error al registrar:", error);
      }
    };

    // Registramos después del load para no bloquear la carga inicial
    if (document.readyState === "complete") {
      registerSW();
    } else {
      window.addEventListener("load", registerSW);
      return () => window.removeEventListener("load", registerSW);
    }
  }, []);
}
