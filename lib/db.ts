import { neon } from "@neondatabase/serverless";

/**
 * Lazy-initialized Neon client.
 *
 * We don't call `neon()` at module scope because Vercel evaluates route
 * modules during `next build` (page data collection), when DATABASE_URL isn't
 * available. Wrapping it in a getter defers initialization to request time.
 */
let cachedClient: ReturnType<typeof neon> | null = null;

export function sql(
  strings: TemplateStringsArray,
  ...values: unknown[]
) {
  if (!cachedClient) {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL no está definida");
    }
    cachedClient = neon(process.env.DATABASE_URL);
  }
  return cachedClient(strings, ...values);
}
