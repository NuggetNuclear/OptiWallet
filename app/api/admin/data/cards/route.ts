import { sql } from "@/lib/db";
import { requireAdmin, clientIp } from "@/lib/admin-guard";
import { logAdminAction } from "@/lib/admin-log";
import { isValidId } from "@/lib/validate";
import { NextRequest, NextResponse } from "next/server";

const NO_CACHE = { "Cache-Control": "no-store" };

export async function GET(req: NextRequest) {
  if (!await requireAdmin(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401, headers: NO_CACHE });
  }
  try {
    const bankId = req.nextUrl.searchParams.get("bankId");
    if (bankId && !isValidId(bankId)) {
      return NextResponse.json({ error: "bankId inválido" }, { status: 400, headers: NO_CACHE });
    }
    const rows = await sql`
      SELECT id, bank_id, name, type FROM cards
      WHERE (${bankId ?? ""} = '' OR bank_id = ${bankId ?? ""})
      ORDER BY bank_id, type, name
    `;
    return NextResponse.json(rows, { headers: NO_CACHE });
  } catch (err) {
    console.error("GET /api/admin/data/cards failed:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500, headers: NO_CACHE });
  }
}

export async function POST(req: NextRequest) {
  const session = await requireAdmin(req);
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401, headers: NO_CACHE });
  }
  try {
    const body = await req.json().catch(() => null);
    const { id, bank_id, name, type } = body ?? {};

    if (!id || !isValidId(id)) return NextResponse.json({ error: "ID inválido" }, { status: 400, headers: NO_CACHE });
    if (!bank_id || !isValidId(bank_id)) return NextResponse.json({ error: "bank_id inválido" }, { status: 400, headers: NO_CACHE });
    if (!name || typeof name !== "string") return NextResponse.json({ error: "name requerido" }, { status: 400, headers: NO_CACHE });
    if (type !== "credit" && type !== "debit") return NextResponse.json({ error: "type debe ser credit o debit" }, { status: 400, headers: NO_CACHE });

    await sql`INSERT INTO cards (id, bank_id, name, type) VALUES (${id}, ${bank_id}, ${name}, ${type})`;
    await logAdminAction(session, "create", "card", id, `Tarjeta "${name}" (${type}) en banco ${bank_id}`, clientIp(req));
    return NextResponse.json({ id }, { status: 201, headers: NO_CACHE });
  } catch (err) {
    console.error("POST /api/admin/data/cards failed:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500, headers: NO_CACHE });
  }
}
