import { sql } from "@/lib/db";
import { isValidId } from "@/lib/validate";
import { clientIp, fixedWindowRateLimit } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";

// Cuántos eventos aceptamos por sesión (o IP) por minuto. Una carga del feed
// dispara ~15-30 'view'; 120/min deja margen holgado para uso real y corta
// floods sintéticos que inflarían el ranking (fase 3) o la tabla.
const RATE_LIMIT = 120;
const RATE_WINDOW_MS = 60_000;

// POST /api/promo-events
// Registra una impresión ('view') o tap ('tap') de una promoción.
// Fire-and-forget desde el cliente — los errores se logean pero no
// interrumpen el flujo del usuario (retorna siempre 204).
//
// Body JSON:
//   promotionId  string   — ID de la promo
//   merchantId   string   — ID del comercio (denormalizado)
//   bankId       string   — ID del banco (denormalizado)
//   eventType    'view' | 'tap'
//   location     'feed' | 'merchant_detail' | 'search'
//   sessionId?   string   — hash anónimo (opcional)

const VALID_EVENT_TYPES = new Set(["view", "tap"]);
const VALID_LOCATIONS   = new Set(["feed", "merchant_detail", "search"]);

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new NextResponse(null, { status: 204 }); // body malformado → ignorar
  }

  const {
    promotionId,
    merchantId,
    bankId,
    eventType,
    location,
    sessionId,
  } = body as Record<string, unknown>;

  // Validación mínima — IDs deben ser slugs válidos
  if (
    typeof promotionId !== "string" || !isValidId(promotionId) ||
    typeof merchantId  !== "string" || !isValidId(merchantId)  ||
    typeof bankId      !== "string" || !isValidId(bankId)      ||
    typeof eventType   !== "string" || !VALID_EVENT_TYPES.has(eventType) ||
    typeof location    !== "string" || !VALID_LOCATIONS.has(location)
  ) {
    return new NextResponse(null, { status: 204 }); // datos inválidos → ignorar silenciosamente
  }

  // sessionId es opcional; si viene debe ser string corto (max 128 chars)
  const sid =
    typeof sessionId === "string" && sessionId.length <= 128
      ? sessionId
      : null;

  // Rate limit por sesión (fallback a IP si no viene sessionId). Silencioso:
  // devolvemos 204 igual que el resto — el cliente es fire-and-forget.
  if (fixedWindowRateLimit(`promo-events:${sid ?? clientIp(req)}`, RATE_LIMIT, RATE_WINDOW_MS)) {
    return new NextResponse(null, { status: 204 });
  }

  try {
    await sql`
      INSERT INTO promo_events
        (promotion_id, merchant_id, bank_id, event_type, location, session_id)
      VALUES
        (${promotionId}, ${merchantId}, ${bankId}, ${eventType}, ${location}, ${sid})
    `;
  } catch (err) {
    // Error de DB nunca rompe el flujo del usuario
    console.error("POST /api/promo-events failed:", err);
  }

  return new NextResponse(null, { status: 204 });
}
