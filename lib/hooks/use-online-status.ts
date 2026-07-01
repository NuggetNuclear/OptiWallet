// lib/hooks/use-online-status.ts
// Hook que expone el estado de conectividad del navegador (navigator.onLine +
// eventos "online"/"offline"). Usado por OfflineBanner para avisar al usuario
// cuando la app está sirviendo datos desde el cache del Service Worker en vez
// de la red (ver docs/SECURITY.md → "UI offline").
//
// Implementado con useSyncExternalStore en vez de useState+useEffect: es el
// patrón recomendado por React para suscribirse a un valor externo al browser
// que puede diferir entre SSR y cliente (navigator.onLine es justamente el
// ejemplo canónico en la documentación de React). Evita el anti-patrón de
// llamar setState sincrónicamente dentro de un efecto solo para "corregir"
// el valor inicial post-hidratación (regla eslint react-hooks/set-state-in-effect).

import { useSyncExternalStore } from "react";

/** Exportadas para poder testear sin un renderer de React (mismo criterio que use-today.ts). */

export function subscribe(callback: () => void): () => void {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

/** Snapshot en el cliente: el valor real del browser. */
export function getSnapshot(): boolean {
  return navigator.onLine;
}

/** Snapshot en el server (SSR): no hay conexión que medir — asumimos online
 *  para no renderizar el banner en el HTML servido; el cliente corrige solo
 *  al hidratar si `navigator.onLine` es `false`. */
export function getServerSnapshot(): boolean {
  return true;
}

export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
