import { sql } from "@/lib/db";
import { requireAdmin, clientIp } from "@/lib/admin-guard";
import { logAdminAction } from "@/lib/admin-log";
import { isValidId } from "@/lib/validate";
import { runBankFetch, type FetchOutcome } from "@/lib/ops/fetch-bank";
import { NextRequest, NextResponse } from "next/server";

const NO_CACHE = { "Cache-Control": "no-store" };

/**
 * POST /api/admin/ops/fetch
 *
 * Ejecuta el scraper de un banco desde el servidor y auto-importa los resultados
 * a staging. La lógica vive en `runBankFetch` (compartida con la variante SSE
 * `/stream`); aquí se ignora el progreso y solo se devuelve el resultado final.
 *
 * Body: { bank_id: string, cookie?: string }
 * Responses: 201 éxito · 400 bank inválido/sin scraper · 401 sin sesión ·
 *            428 cookie requerida (Imperva) · 500 error interno
 */
export async function POST(req: NextRequest) {
  const session = await requireAdmin(req);
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401, headers: NO_CACHE });
  }

  try {
    const body = await req.json().catch(() => null);
    const bankId: string = body?.bank_id;
    const providedCookie: string | undefined = body?.cookie;

    if (!bankId || !isValidId(bankId)) {
      return NextResponse.json({ error: "bank_id inválido" }, { status: 400, headers: NO_CACHE });
    }
    const bankRows = await sql`SELECT id FROM banks WHERE id = ${bankId}`;
    if (bankRows.length === 0) {
      return NextResponse.json({ error: `El banco '${bankId}' no existe` }, { status: 400, headers: NO_CACHE });
    }

    // Consumir el generador ignorando el progreso; nos quedamos con el resultado.
    const gen = runBankFetch({ bankId, providedCookie, adminEmail: session.email });
    let step = await gen.next();
    while (!step.done) step = await gen.next();
    const result: FetchOutcome = step.value;

    if (result.kind === "no_scraper") {
      return NextResponse.json({ error: `No hay scraper configurado para '${bankId}'` }, { status: 400, headers: NO_CACHE });
    }
    if (result.kind === "cookie_required") {
      return NextResponse.json(
        { error: "cookie_required", message: result.message, instructions: result.instructions },
        { status: 428, headers: NO_CACHE },
      );
    }

    await logAdminAction(
      session, "import", "scraper_run", String(result.run_id),
      `Auto-fetch ${bankId}: ${result.raw_entries} raw → ${result.total} clean, ${result.imported} a staging, ${result.skipped} duplicados, ${result.edge_count} edges`,
      clientIp(req),
    );

    return NextResponse.json(
      {
        run_id: result.run_id,
        raw_entries: result.raw_entries,
        total: result.total,
        imported: result.imported,
        skipped: result.skipped,
        edge_count: result.edge_count,
        edge_counts: result.edge_counts,
      },
      { status: 201, headers: NO_CACHE },
    );
  } catch (err) {
    console.error("POST /api/admin/ops/fetch failed:", err);
    return NextResponse.json({ error: "Error interno al ejecutar el scraper" }, { status: 500, headers: NO_CACHE });
  }
}
