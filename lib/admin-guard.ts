import "server-only";

/**
 * Server-side authorization helpers for the admin API.
 *
 * Two responsibilities live here so every route stays DRY and consistent:
 *
 *  1. `requireAdmin` — DB-backed session validation. The HMAC cookie proves the
 *     token wasn't forged, but it stays valid for up to 8h regardless of what
 *     happens to the account. Re-checking the database on each request means a
 *     deleted admin, a reset TOTP, or a disabled account loses API access
 *     *immediately* instead of at the next cookie expiry. Fails closed.
 *
 *  2. Rate limiting — shared between every credential/code-checking endpoint
 *     (login, TOTP verify, TOTP enrollment, first-admin setup) so brute force
 *     is throttled uniformly, not just on the password step.
 */

import { NextRequest } from "next/server";
import { sql } from "./db";
import { getAdminFromRequest } from "./admin-session";
import type { AdminSessionPayload } from "./admin-types";

/**
 * Returns the session payload only if the cookie is valid AND the admin still
 * exists with an active TOTP enrollment. Returns null otherwise (fail closed).
 */
export async function requireAdmin(req: NextRequest): Promise<AdminSessionPayload | null> {
  const session = await getAdminFromRequest(req);
  if (!session) return null;

  try {
    const rows = await sql`
      SELECT totp_enabled FROM admin_users WHERE id = ${session.adminId}
    `;
    const user = rows[0] as { totp_enabled: boolean } | undefined;
    // Account must exist and have completed 2FA enrollment.
    if (!user || !user.totp_enabled) return null;
    return session;
  } catch (err) {
    console.error("requireAdmin DB check failed:", err);
    return null;
  }
}

// ── Rate limiting ───────────────────────────────────────────────────────────

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

/** Best-effort client IP from the proxy chain. */
export function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

/**
 * True if this IP has reached the failed-attempt ceiling inside the window.
 * Reused across all auth/code-verification endpoints.
 */
export async function isRateLimited(ip: string): Promise<boolean> {
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const rows = await sql`
    SELECT COUNT(*)::int AS n
    FROM admin_login_attempts
    WHERE ip_address = ${ip} AND attempted_at >= ${since}::timestamptz
  `;
  return (rows[0] as { n: number }).n >= MAX_ATTEMPTS;
}

/** Records one failed attempt for this IP. */
export async function recordFailedAttempt(ip: string): Promise<void> {
  await sql`INSERT INTO admin_login_attempts (ip_address) VALUES (${ip})`;
}
