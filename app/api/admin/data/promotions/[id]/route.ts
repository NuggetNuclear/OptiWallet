import { sql } from "@/lib/db";
import { requireAdmin, clientIp } from "@/lib/admin-guard";
import { logAdminAction } from "@/lib/admin-log";
import {
  isValidId,
  isValidCardTypes,
  isValidDaysOfWeek,
  isNonNegativeIntOrNull,
  isValidDateOrNull,
} from "@/lib/validate";
import { NextRequest, NextResponse } from "next/server";

const NO_CACHE = { "Cache-Control": "no-store" };
type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  if (!await requireAdmin(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401, headers: NO_CACHE });
  }
  const { id } = await params;
  if (!isValidId(id)) return NextResponse.json({ error: "ID inválido" }, { status: 400, headers: NO_CACHE });
  try {
    const rows = await sql`
      SELECT
        p.id, p.bank_id, p.card_types, p.merchant_id, p.discount, p.cap, p.min_purchase,
        p.days_of_week, p.start_date, p.end_date, p.modality, p.code, p.conditions,
        p.source, p.verified_at, p.active, p.created_at, p.updated_at,
        b.name AS bank_name, m.name AS merchant_name
      FROM promotions p
      JOIN banks     b ON p.bank_id     = b.id
      JOIN merchants m ON p.merchant_id = m.id
      WHERE p.id = ${id}
    `;
    if (!rows.length) return NextResponse.json(null, { status: 404, headers: NO_CACHE });
    return NextResponse.json(rows[0], { headers: NO_CACHE });
  } catch (err) {
    console.error("GET /api/admin/data/promotions/[id] failed:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500, headers: NO_CACHE });
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await requireAdmin(req);
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401, headers: NO_CACHE });
  }
  const { id } = await params;
  if (!isValidId(id)) return NextResponse.json({ error: "ID inválido" }, { status: 400, headers: NO_CACHE });
  try {
    const body = await req.json().catch(() => null);
    const fields: Record<string, unknown> = body ?? {};
    const has = (k: string) => Object.prototype.hasOwnProperty.call(fields, k);

    // Validate every provided field up front → 400 (clear) instead of a DB CHECK
    // error surfacing as 500. (audit L4)
    if (has("bank_id") && !isValidId(fields.bank_id as string)) return NextResponse.json({ error: "bank_id inválido" }, { status: 400, headers: NO_CACHE });
    if (has("merchant_id") && !isValidId(fields.merchant_id as string)) return NextResponse.json({ error: "merchant_id inválido" }, { status: 400, headers: NO_CACHE });
    if (has("discount") && (typeof fields.discount !== "number" || fields.discount < 1 || fields.discount > 100)) return NextResponse.json({ error: "discount debe ser 1-100" }, { status: 400, headers: NO_CACHE });
    if (has("modality") && !["presencial", "online", "both"].includes(fields.modality as string)) return NextResponse.json({ error: "modality inválido" }, { status: 400, headers: NO_CACHE });
    if (has("card_types") && !isValidCardTypes(fields.card_types)) return NextResponse.json({ error: "card_types debe ser un array no vacío de 'credit'/'debit'" }, { status: 400, headers: NO_CACHE });
    if (has("days_of_week") && !isValidDaysOfWeek(fields.days_of_week)) return NextResponse.json({ error: "days_of_week debe ser enteros 0-6" }, { status: 400, headers: NO_CACHE });
    if (has("cap") && !isNonNegativeIntOrNull(fields.cap)) return NextResponse.json({ error: "cap debe ser un entero ≥ 0 o null" }, { status: 400, headers: NO_CACHE });
    if (has("min_purchase") && !isNonNegativeIntOrNull(fields.min_purchase)) return NextResponse.json({ error: "min_purchase debe ser un entero ≥ 0 o null" }, { status: 400, headers: NO_CACHE });
    if (has("start_date") && !isValidDateOrNull(fields.start_date)) return NextResponse.json({ error: "start_date inválida (YYYY-MM-DD)" }, { status: 400, headers: NO_CACHE });
    if (has("end_date") && !isValidDateOrNull(fields.end_date)) return NextResponse.json({ error: "end_date inválida (YYYY-MM-DD)" }, { status: 400, headers: NO_CACHE });
    if (has("verified_at") && !isValidDateOrNull(fields.verified_at)) return NextResponse.json({ error: "verified_at inválida (YYYY-MM-DD)" }, { status: 400, headers: NO_CACHE });
    if (has("source") && (typeof fields.source !== "string" || !fields.source.trim())) return NextResponse.json({ error: "source inválido" }, { status: 400, headers: NO_CACHE });
    if (has("active") && typeof fields.active !== "boolean") return NextResponse.json({ error: "active inválido" }, { status: 400, headers: NO_CACHE });
    if (has("code") && fields.code !== null && typeof fields.code !== "string") return NextResponse.json({ error: "code inválido" }, { status: 400, headers: NO_CACHE });
    if (has("conditions") && fields.conditions !== null && typeof fields.conditions !== "string") return NextResponse.json({ error: "conditions inválido" }, { status: 400, headers: NO_CACHE });

    const allowed = [
      "bank_id", "card_types", "merchant_id", "discount", "cap", "min_purchase",
      "days_of_week", "start_date", "end_date", "modality", "code", "conditions",
      "source", "verified_at", "active",
    ] as const;

    const changed = allowed.filter((k) => has(k));
    if (!changed.length) {
      // Nothing to update — confirm the row exists, then no-op.
      const exists = await sql`SELECT id FROM promotions WHERE id = ${id}`;
      if (!exists.length) return NextResponse.json(null, { status: 404, headers: NO_CACHE });
      return NextResponse.json({ status: "ok" }, { headers: NO_CACHE });
    }

    // Read current row, merge provided fields, write back in ONE atomic UPDATE
    // (no partial-write window if something fails mid-way). (audit L4)
    const rows = await sql`
      SELECT bank_id, card_types, merchant_id, discount, cap, min_purchase,
             days_of_week, start_date, end_date, modality, code, conditions,
             source, verified_at, active
      FROM promotions WHERE id = ${id}
    `;
    if (!rows.length) return NextResponse.json(null, { status: 404, headers: NO_CACHE });
    const cur = rows[0] as Record<string, unknown>;
    const pick = (k: string, nullable = false) =>
      has(k) ? (nullable ? ((fields[k] ?? null) as unknown) : fields[k]) : cur[k];

    const next = {
      bank_id:      pick("bank_id"),
      card_types:   pick("card_types"),
      merchant_id:  pick("merchant_id"),
      discount:     pick("discount"),
      cap:          pick("cap", true),
      min_purchase: pick("min_purchase", true),
      days_of_week: pick("days_of_week"),
      start_date:   pick("start_date", true),
      end_date:     pick("end_date", true),
      modality:     pick("modality"),
      code:         pick("code", true),
      conditions:   pick("conditions", true),
      source:       pick("source"),
      verified_at:  pick("verified_at"),
      active:       pick("active"),
    };

    // Cross-field check on the merged result (string dates compare lexicographically).
    if (next.start_date && next.end_date && (next.end_date as string) < (next.start_date as string)) {
      return NextResponse.json({ error: "end_date no puede ser anterior a start_date" }, { status: 400, headers: NO_CACHE });
    }

    await sql`
      UPDATE promotions SET
        bank_id      = ${next.bank_id as string},
        card_types   = ${next.card_types as string[]},
        merchant_id  = ${next.merchant_id as string},
        discount     = ${next.discount as number},
        cap          = ${next.cap as number | null},
        min_purchase = ${next.min_purchase as number | null},
        days_of_week = ${next.days_of_week as number[]},
        start_date   = ${next.start_date as string | null}::date,
        end_date     = ${next.end_date as string | null}::date,
        modality     = ${next.modality as string},
        code         = ${next.code as string | null},
        conditions   = ${next.conditions as string | null},
        source       = ${next.source as string},
        verified_at  = ${next.verified_at as string}::date,
        active        = ${next.active as boolean},
        updated_at   = now()
      WHERE id = ${id}
    `;

    await logAdminAction(session, "update", "promotion", id, `Campos: ${changed.join(", ")}`, clientIp(req));
    return NextResponse.json({ status: "ok" }, { headers: NO_CACHE });
  } catch (err) {
    console.error("PATCH /api/admin/data/promotions/[id] failed:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500, headers: NO_CACHE });
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await requireAdmin(req);
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401, headers: NO_CACHE });
  }
  const { id } = await params;
  if (!isValidId(id)) return NextResponse.json({ error: "ID inválido" }, { status: 400, headers: NO_CACHE });
  try {
    await sql`DELETE FROM promotions WHERE id = ${id}`;
    await logAdminAction(session, "delete", "promotion", id, `Promoción eliminada`, clientIp(req));
    return NextResponse.json({ status: "ok" }, { headers: NO_CACHE });
  } catch (err) {
    console.error("DELETE /api/admin/data/promotions/[id] failed:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500, headers: NO_CACHE });
  }
}
