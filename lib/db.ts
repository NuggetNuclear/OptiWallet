import "server-only";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

/**
 * Lazy-initialized Neon client.
 *
 * We don't call `neon()` at module scope because Vercel evaluates route
 * modules during `next build` (page data collection), when DATABASE_URL isn't
 * available. Wrapping it in a getter defers initialization to request time.
 *
 * Tipado: `NeonQueryFunction<false, false>` (arrayMode=false, fullResults=false)
 * en vez de `ReturnType<typeof neon>` — este último colapsa los genéricos en
 * una unión (`any[][] | Record<string,any>[] | FullQueryResults`) que rompe
 * `rows.length` / `rows[0]` en los routes y hace fallar `next build`.
 */
let cachedClient: NeonQueryFunction<false, false> | null = null;

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
