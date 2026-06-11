/**
 * Detección de modo standalone (PWA instalada) + cookie para la
 * redirección inteligente landing → app.
 *
 * Piezas del sistema:
 *  - `lib/standalone.ts` (este archivo): detección + manejo de cookie.
 *  - `<StandaloneCookieSync />` (root layout): mantiene la cookie en sync
 *    en TODAS las páginas — la setea en standalone, la borra en navegador.
 *    Esto auto-repara el caso Android, donde la PWA comparte cookies con
 *    Chrome: si el middleware redirige por error a un usuario de Chrome,
 *    /app borra la cookie y la landing vuelve a ser accesible.
 *  - `<StandaloneRedirect />` (landing): fallback client-side que redirige
 *    a /app la primera vez (cookie aún no existe) o en modo offline.
 *  - `proxy.ts`: redirección server-side `/` → `/app` cuando la cookie
 *    existe — sin flash de landing.
 */

export const STANDALONE_COOKIE = "ow_standalone";

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  // `navigator.standalone`: API legacy de iOS Safari, fuera del estándar
  const iosStandalone =
    (window.navigator as { standalone?: boolean }).standalone === true;
  return (
    window.matchMedia("(display-mode: standalone)").matches || iosStandalone
  );
}

export function syncStandaloneCookie(): void {
  if (typeof document === "undefined") return;
  if (isStandalone()) {
    document.cookie = `${STANDALONE_COOKIE}=1; path=/; max-age=31536000; samesite=lax`;
  } else if (document.cookie.includes(`${STANDALONE_COOKIE}=1`)) {
    document.cookie = `${STANDALONE_COOKIE}=; path=/; max-age=0`;
  }
}
