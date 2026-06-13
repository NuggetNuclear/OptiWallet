// lib/hooks/use-service-worker.ts
// Hook que registra el Service Worker y expone el estado de actualización.
// Cuando hay una nueva versión instalada en background, `updateAvailable`
// se pone en `true` y se puede llamar `applyUpdate()` para recargar.

import { useEffect, useState, useCallback } from "react";

interface UseServiceWorkerReturn {
  /** `true` cuando hay un SW nuevo instalado esperando tomar control. */
  updateAvailable: boolean;
  /** Activa el SW nuevo y recarga la página. */
  applyUpdate: () => void;
  /** Descarta el banner sin actualizar (el SW se activará en la próxima visita). */
  dismiss: () => void;
}

export function useServiceWorker(): UseServiceWorkerReturn {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

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

        // Si ya hay un SW esperando al montar (tab dormida mucho tiempo)
        if (registration.waiting && navigator.serviceWorker.controller) {
          setWaitingWorker(registration.waiting);
          setUpdateAvailable(true);
        }

        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener("statechange", () => {
            if (
              newWorker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              // Nueva versión lista — mostrar banner.
              setWaitingWorker(newWorker);
              setUpdateAvailable(true);
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

  const applyUpdate = useCallback(() => {
    if (!waitingWorker) return;
    // Escuchar el cambio de controlador y recargar
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      window.location.reload();
    });
    // Decirle al SW en espera que tome control (skipWaiting ya lo hace,
    // pero por si acaso el SW no lo hizo automáticamente)
    waitingWorker.postMessage({ type: "SKIP_WAITING" });
  }, [waitingWorker]);

  const dismiss = useCallback(() => {
    setUpdateAvailable(false);
  }, []);

  return { updateAvailable, applyUpdate, dismiss };
}
