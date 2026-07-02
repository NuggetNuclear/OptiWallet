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

    // Un solo listener de visibilidad, referenciado fuera de registerSW para
    // que el cleanup del efecto siempre pueda removerlo.
    let checkForUpdate: (() => void) | null = null;

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
            }
          });
        });

        // En una PWA abierta, la navegación es client-side y el browser no
        // vuelve a pedir /sw.js solo. Forzamos un chequeo cuando la tab vuelve
        // a foco para que el banner aparezca sin tener que hacer hard-reload.
        checkForUpdate = () => {
          if (document.visibilityState === "visible") {
            registration.update().catch(() => {});
          }
        };
        document.addEventListener("visibilitychange", checkForUpdate);
      } catch {
        // El registro del SW es best-effort: si falla, la app sigue funcionando
        // online sin offline-cache. No ruidamos la consola del usuario final.
      }
    };

    // Registramos después del load para no bloquear la carga inicial
    if (document.readyState === "complete") {
      registerSW();
    } else {
      window.addEventListener("load", registerSW);
    }

    return () => {
      window.removeEventListener("load", registerSW);
      if (checkForUpdate) document.removeEventListener("visibilitychange", checkForUpdate);
    };
  }, []);

  const applyUpdate = useCallback(() => {
    if (!waitingWorker) return;
    // Escuchar el cambio de controlador y recargar ({once}: sin acumular
    // listeners si el usuario toca el botón más de una vez)
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      () => {
        window.location.reload();
      },
      { once: true },
    );
    // Decirle al SW en espera que tome control (skipWaiting ya lo hace,
    // pero por si acaso el SW no lo hizo automáticamente)
    waitingWorker.postMessage({ type: "SKIP_WAITING" });
  }, [waitingWorker]);

  const dismiss = useCallback(() => {
    setUpdateAvailable(false);
  }, []);

  return { updateAvailable, applyUpdate, dismiss };
}
