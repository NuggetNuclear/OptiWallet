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

/**
 * Actualiza el flag en la DB e invalida el cache local inmediatamente.
 */
export async function setMaintenanceMode(
  enabled: boolean,
  updatedBy: string
): Promise<void> {
  await sql`
    INSERT INTO app_settings (key, value, updated_by)
      VALUES ('maintenance_mode', ${String(enabled)}, ${updatedBy})
      ON CONFLICT (key) DO UPDATE
        SET value      = EXCLUDED.value,
            updated_by = EXCLUDED.updated_by,
            updated_at = now()
  `;
  // Invalida el cache inmediatamente para que el proxy vea el cambio en ≤30s
  cached = null;
}

/**
 * Lee el registro completo (valor + quién lo cambió + cuándo).
 */
export async function getMaintenanceStatus(): Promise<{
  enabled: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}> {
  try {
    const rows = await sql`
      SELECT value, updated_at, updated_by
      FROM app_settings
      WHERE key = 'maintenance_mode'
    `;
    const row = rows[0] as
      | { value: string; updated_at: string; updated_by: string | null }
      | undefined;
    return {
      enabled: row?.value === "true",
      updatedAt: row?.updated_at ?? null,
      updatedBy: row?.updated_by ?? null,
    };
  } catch {
    return { enabled: false, updatedAt: null, updatedBy: null };
  }
}
