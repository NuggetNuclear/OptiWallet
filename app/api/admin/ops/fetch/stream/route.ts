import { sql } from "@/lib/db";
import { requireAdmin, clientIp } from "@/lib/admin-guard";
import { logAdminAction } from "@/lib/admin-log";
import { isValidId } from "@/lib/validate";
import { runBankFetch } from "@/lib/ops/fetch-bank";
import { NextRequest } from "next/server";

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
};

type EventLevel = "info" | "warn" | "error" | "success";
type SseEvent =
  | { type: "log"; msg: string; level: EventLevel }
  | { type: "cookie_required"; message: string; instructions: string[] }
  | { type: "done"; summary?: { run_id: number; raw_entries: number; total: number; imported: number; skipped: number; edge_count: number; edge_counts: Record<string, number> }; error?: string };

/**
 * POST /api/admin/ops/fetch/stream
 *
 * Igual que /fetch pero transmite el progreso del scraper por Server-Sent Events
 * para alimentar el TerminalConsole (mismo mecanismo que approve-all/stream).
 * Body: { bank_id, cookie? }.
 */
export async function POST(req: NextRequest) {
  const session = await requireAdmin(req);
  if (!session) {
    return new Response(JSON.stringify({ error: "No autorizado" }), { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const bankId: string = body?.bank_id;
  const providedCookie: string | undefined = body?.cookie;

  if (!bankId || !isValidId(bankId)) {
    return new Response(JSON.stringify({ error: "bank_id inválido" }), { status: 400 });
  }
  const bankRows = await sql`SELECT id FROM banks WHERE id = ${bankId}`;
  if (bankRows.length === 0) {
    return new Response(JSON.stringify({ error: `El banco '${bankId}' no existe` }), { status: 400 });
  }

  const ip = clientIp(req);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: SseEvent) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));

      try {
        const gen = runBankFetch({ bankId, providedCookie, adminEmail: session.email });
        let step = await gen.next();
        while (!step.done) {
          emit({ type: "log", msg: step.value.msg, level: step.value.level });
          step = await gen.next();
        }
        const result = step.value;

        if (result.kind === "no_scraper") {
          emit({ type: "log", msg: `No hay scraper configurado para '${bankId}'.`, level: "error" });
          emit({ type: "done", error: "Sin scraper" });
        } else if (result.kind === "cookie_required") {
          emit({ type: "log", msg: "El banco bloqueó la conexión (anti-bot).", level: "warn" });
          emit({ type: "cookie_required", message: result.message, instructions: result.instructions });
        } else {
          await logAdminAction(
            session, "import", "scraper_run", String(result.run_id),
            `Auto-fetch ${bankId}: ${result.raw_entries} raw → ${result.total} clean, ${result.imported} a staging, ${result.skipped} duplicados, ${result.edge_count} edges`,
            ip,
          );
          emit({
            type: "done",
            summary: {
              run_id: result.run_id,
              raw_entries: result.raw_entries,
              total: result.total,
              imported: result.imported,
              skipped: result.skipped,
              edge_count: result.edge_count,
              edge_counts: result.edge_counts,
            },
          });
        }
      } catch (err) {
        console.error("POST /api/admin/ops/fetch/stream failed:", err);
        emit({ type: "log", msg: `Error: ${err instanceof Error ? err.message : String(err)}`, level: "error" });
        emit({ type: "done", error: "Error interno al ejecutar el scraper" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
