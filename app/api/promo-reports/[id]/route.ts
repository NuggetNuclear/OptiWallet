import { sql } from "@/lib/db";
import { isValidReportReason } from "@/lib/validate";
import { NextRequest, NextResponse } from "next/server";

const NOTE_MAX = 280;

// PATCH /api/promo-reports/[id]
// Refina un reporte recién creado con un motivo (y nota opcional). Solo aplica si
// el reporte existe, aún no tiene motivo, y se creó hace menos de 15 min — así el
// endpoint público no puede reescribir reportes antiguos ajenos. 204 siempre
// (fire-and-forget desde el cliente).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) return new NextResponse(null, { status: 204 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new NextResponse(null, { status: 204 });
  }

  const { reason, note } = body as Record<string, unknown>;
  if (!isValidReportReason(reason)) return new NextResponse(null, { status: 204 });

  const cleanNote =
    reason === "other" && typeof note === "string" && note.trim()
      ? note.trim().slice(0, NOTE_MAX)
      : null;

  try {
    await sql`
      UPDATE promo_reports
      SET reason = ${reason}, note = ${cleanNote}
      WHERE id = ${Number(id)}
        AND reason IS NULL
        AND created_at > now() - interval '15 minutes'
    `;
  } catch (err) {
    console.error("PATCH /api/promo-reports/[id] failed:", err);
  }
  return new NextResponse(null, { status: 204 });
}
