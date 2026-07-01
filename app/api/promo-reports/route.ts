import { sql } from "@/lib/db";
import { isValidId } from "@/lib/validate";
import { clientIp, fixedWindowRateLimit } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";

// Cuántos reportes aceptamos por sesión (o IP) por minuto. Reportar es una acción
// deliberada (no pasiva como los 'view'), así que un límite bajo basta para cortar
// floods sintéticos sin molestar a un usuario real.
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;

// POST /api/promo-reports
// Crea un reporte de una promo en el instante en que el usuario toca 👎. El motivo
// llega después (opcional) vía PATCH /api/promo-reports/[id]. Devuelve { id } para
// que el cliente pueda refinarlo; datos inválidos o rate-limit → 204 silencioso.
//
// Body JSON:
//   promotionId  string
//   merchantId   string   (denormalizado)
//   bankId       string   (denormalizado)
//   sessionId?   string   (hash anónimo, opcional)
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new NextResponse(null, { status: 204 });
  }

  const { promotionId, merchantId, bankId, sessionId } = body as Record<string, unknown>;

  if (
    typeof promotionId !== "string" || !isValidId(promotionId) ||
    typeof merchantId  !== "string" || !isValidId(merchantId)  ||
    typeof bankId      !== "string" || !isValidId(bankId)
  ) {
    return new NextResponse(null, { status: 204 });
  }

  const sid = typeof sessionId === "string" && sessionId.length <= 128 ? sessionId : null;

  if (fixedWindowRateLimit(`promo-reports:${sid ?? clientIp(req)}`, RATE_LIMIT, RATE_WINDOW_MS)) {
    return new NextResponse(null, { status: 204 });
  }

  try {
    const rows = await sql`
      INSERT INTO promo_reports (promotion_id, merchant_id, bank_id, session_id)
      VALUES (${promotionId}, ${merchantId}, ${bankId}, ${sid})
      RETURNING id
    `;
    const id = (rows[0] as { id: number } | undefined)?.id ?? null;
    return NextResponse.json({ id }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    // La FK exige que la promo exista; si el cliente manda una promo inexistente
    // (o hay un error de DB) no rompemos el flujo del usuario.
    console.error("POST /api/promo-reports failed:", err);
    return new NextResponse(null, { status: 204 });
  }
}
