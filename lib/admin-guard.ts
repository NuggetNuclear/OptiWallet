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

    // Session revocation: the token embeds the admin's token_version at sign
    // time; bumping it in the DB (password change, logout-all) invalidates every
    // outstanding session immediately. `readTokenVersion` fails open ONLY for the
    // additive tv check (see its docstring), so a not-yet-migrated DB keeps
    // working — the totp check above already fails closed on any real DB error.
    if ((session.tv ?? 0) !== (await readTokenVersion(session.adminId))) return null;

    return session;
  } catch (err) {
    console.error("requireAdmin DB check failed:", err);
    return null;
  }
}

/**
 * Current `token_version` for an admin, used for session revocation.
 *
 * Self-healing across the migration boundary: if the `token_version` column
 * doesn't exist yet (deploy ran before `npm run db:schema`), this returns 0 and
 * the revocation check becomes a no-op instead of locking everyone out. Once the
 * column exists it returns the real value. A legacy session with no `tv` claim
 * is treated as 0, matching the column default, so nobody is logged out on the
 * migration itself — only an explicit bump invalidates sessions.
 */
export async function readTokenVersion(adminId: string): Promise<number> {
  try {
    const rows = await sql`SELECT token_version FROM admin_users WHERE id = ${adminId}`;
    return Number((rows[0] as { token_version?: number } | undefined)?.token_version ?? 0);
  } catch {
    return 0; // column not migrated yet — revocation disabled until then
  }
}

/**
 * Increments an admin's token_version, invalidating all their outstanding
 * sessions. Best-effort: silently no-ops if the column isn't migrated yet, so
 * credential changes never 500 on a pre-migration DB.
 */
export async function bumpTokenVersion(adminId: string): Promise<void> {
  try {
    await sql`UPDATE admin_users SET token_version = token_version + 1 WHERE id = ${adminId}`;
  } catch (err) {
    console.warn("bumpTokenVersion skipped (run npm run db:schema to enable):", err);
  }
}

// ── Rate limiting ───────────────────────────────────────────────────────────

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Best-effort client IP for rate limiting.
 *
 * The LEFTMOST `X-Forwarded-For` entry is client-controllable (an attacker can
 * prepend arbitrary values), so trusting it lets them rotate it and bypass the
 * per-IP throttle. We prefer `x-real-ip` (set by Vercel's edge, not the client)
 * and otherwise fall back to the RIGHTMOST XFF hop — the one appended by the
 * closest trusted proxy, which is the hardest for the client to forge.
 */
export function clientIp(req: NextRequest): string {
  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const hops = xff.split(",").map((h) => h.trim()).filter(Boolean);
    if (hops.length) return hops[hops.length - 1];
  }
  return "unknown";
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
  // Opportunistic pruning: rows older than the rate-limit window are useless and
  // would otherwise accumulate forever. Best-effort — never block the auth path.
  try {
    const cutoff = new Date(Date.now() - WINDOW_MS).toISOString();
    await sql`DELETE FROM admin_login_attempts WHERE attempted_at < ${cutoff}::timestamptz`;
  } catch (err) {
    console.warn("admin_login_attempts prune skipped:", err);
  }
}
