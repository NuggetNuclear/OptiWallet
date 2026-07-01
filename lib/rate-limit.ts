import type { NextRequest } from "next/server";

/**
 * Best-effort client IP for rate limiting.
 *
 * The LEFTMOST `X-Forwarded-For` entry is client-controllable (an attacker can
 * prepend arbitrary values), so trusting it lets them rotate it and bypass a
 * per-IP throttle. We prefer `x-real-ip` (set by Vercel's edge, not the client)
 * and otherwise fall back to the RIGHTMOST XFF hop — the one appended by the
 * closest trusted proxy, which is the hardest for the client to forge.
 *
 * Lives here (dependency-free) so both the admin guard and public endpoints
 * share one implementation instead of drifting copies.
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
 * In-memory fixed-window rate limiter.
 *
 * Intended for high-volume PUBLIC endpoints (e.g. promo-events) where a
 * DB-backed counter (like admin_login_attempts) would add a write per request.
 *
 * Caveats — read before relying on it as a security control:
 *   - Per-instance and ephemeral: on serverless (Vercel) each lambda has its own
 *     Map, and it resets on cold start. So the effective limit is roughly
 *     `limit × concurrent_instances`. This is a spam/DoS DAMPENER, not a hard
 *     guarantee. For strict limits, back it with Redis/Upstash or the DB.
 *   - Keyed by whatever the caller passes (session id, then IP). A determined
 *     abuser can rotate the key; the goal here is to stop casual/accidental
 *     floods and keep the table from ballooning, not to be unbypassable.
 *
 * @returns true if this call is OVER the limit (caller should reject/ignore).
 */
interface WindowState {
  count: number;
  resetAt: number;
}

const windows = new Map<string, WindowState>();
let lastSweep = 0;

export function fixedWindowRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): boolean {
  const now = Date.now();

  // Opportunistic sweep of expired entries so the Map can't grow unbounded.
  // Runs at most once per window, and only touches already-expired keys.
  if (now - lastSweep > windowMs) {
    lastSweep = now;
    for (const [k, w] of windows) {
      if (now >= w.resetAt) windows.delete(k);
    }
  }

  const w = windows.get(key);
  if (!w || now >= w.resetAt) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return 1 > limit; // honors limit=0 (blocks immediately)
  }
  w.count++;
  return w.count > limit;
}
