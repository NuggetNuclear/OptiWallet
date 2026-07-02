import { sql } from "@/lib/db";
import { isValidReportReason, isValidReportToken } from "@/lib/validate";
import { clientIp, fixedWindowRateLimit } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";

const NOTE_MAX = 280;
// Un usuario real refina a lo más un puñado de reportes por minuto; esto corta
// barridos de enumeración sin molestar a nadie.
const RATE_LIMIT_IP = 30;
const RATE_WINDOW_MS = 60_000;
// Los ids BIGSERIAL caben holgados en un int53; algo más largo es un probe.
const ID_MAX_DIGITS = 15;

// PATCH /api/promo-reports/[id]
// Refina un reporte recién creado con un motivo (y nota opcional). Exige el
// `token` (UUID) que devolvió el POST — los ids solos son secuenciales y
// enumerables, así que sin token cualquiera podría reescribir reportes ajenos.
// Además solo aplica si el reporte aún no tiene motivo y se creó hace menos de
// 15 min. 204 siempre (fire-and-forget desde el cliente).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id) || id.length > ID_MAX_DIGITS) {
    return new NextResponse(null, { status: 204 });
  }

  if (fixedWindowRateLimit(`promo-report-patch:${clientIp(req)}`, RATE_LIMIT_IP, RATE_WINDOW_MS)) {
    return new NextResponse(null, { status: 204 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new NextResponse(null, { status: 204 });
  }

  const { reason, note, token } = body as Record<string, unknown>;
  if (!isValidReportReason(reason)) return new NextResponse(null, { status: 204 });
  if (!isValidReportToken(token)) return new NextResponse(null, { status: 204 });

  const cleanNote =
    reason === "other" && typeof note === "string" && note.trim()
      ? note.trim().slice(0, NOTE_MAX)
      : null;

  try {
    await sql`
      UPDATE promo_reports
      SET reason = ${reason}, note = ${cleanNote}
      WHERE id = ${Number(id)}
        AND token = ${token}::uuid
        AND reason IS NULL
        AND created_at > now() - interval '15 minutes'
    `;
  } catch (err) {
    console.error("PATCH /api/promo-reports/[id] failed:", err);
  }
  return new NextResponse(null, { status: 204 });
}
