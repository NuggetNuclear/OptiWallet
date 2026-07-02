import "server-only";
import { sql } from "./db";

/**
 * Cache en memoria para el flag de mantenimiento.
 * Evita un DB roundtrip en cada request del proxy — el valor se refresca
 * como máximo cada CACHE_TTL_MS. Suficientemente rápido para activación/
 * desactivación manual: el admin lo activa y en ≤30s todos los usuarios ven
 * la pantalla de mantenimiento.
 */
const CACHE_TTL_MS = 30_000; // 30 segundos

let cached: { value: boolean; expiresAt: number } | null = null;

/**
 * Devuelve true si el modo de mantenimiento está activo.
 * Falla abierto: si la DB no responde devuelve false para no bloquear a nadie.
 *
 * La escritura de este flag (`setMaintenanceMode`) vive en el repo admin —
 * ambos leen/escriben la misma fila de `app_settings` en el Neon compartido,
 * coordinados solo por la convención de clave ('maintenance_mode') y valores
 * ('true'/'false'). Ver ADR-002/005 en ARCHITECTURE_DECISION.md.
 */
export async function isMaintenanceMode(): Promise<boolean> {
  const now = Date.now();
  if (cached && now < cached.expiresAt) return cached.value;

  try {
    const rows = await sql`
      SELECT value FROM app_settings WHERE key = 'maintenance_mode'
    `;
    const value = (rows[0] as { value: string } | undefined)?.value === "true";
    cached = { value, expiresAt: now + CACHE_TTL_MS };
    return value;
  } catch (err) {
    console.warn("isMaintenanceMode: DB error, failing open:", err);
    return false;
  }
}
