import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-guard";
import { rankMerchants, suggestCategory, type MerchantLite, type CategoryLite } from "@/lib/ai/merchant-suggest";
import { NextRequest, NextResponse } from "next/server";

const NO_CACHE = { "Cache-Control": "no-store" };

/**
 * POST /api/admin/ops/suggest-merchant
 *
 * Sugerencias para resolver un comercio scrapeado en la revisión:
 *  - `candidates`: top-5 comercios existentes por similitud (embeddings, o
 *    matching por tokens si no hay IA configurada).
 *  - `suggested_category`: category_id propuesto para crearlo nuevo (generativo).
 *
 * Body: { name: string, withCategory?: boolean }
 */
export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401, headers: NO_CACHE });
  }
  try {
    const body = await req.json().catch(() => null);
    const name: string = body?.name;
    const withCategory: boolean = !!body?.withCategory;
    if (typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "name requerido" }, { status: 400, headers: NO_CACHE });
    }

    const merchants = (await sql`SELECT id, name, aliases, category_id FROM merchants`) as MerchantLite[];

    const { provider, candidates } = await rankMerchants(name, merchants);

    let suggested_category: string | null = null;
    if (withCategory) {
      const categories = (await sql`SELECT id, label FROM merchant_categories`) as CategoryLite[];
      suggested_category = await suggestCategory(name, categories);
    }

    return NextResponse.json({ provider, candidates, suggested_category }, { headers: NO_CACHE });
  } catch (err) {
    console.error("POST /api/admin/ops/suggest-merchant failed:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500, headers: NO_CACHE });
  }
}
