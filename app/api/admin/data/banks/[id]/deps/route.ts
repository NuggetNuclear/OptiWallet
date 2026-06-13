import { sql } from "@/lib/db";
import { getAdminFromRequest } from "@/lib/admin-session";
import { isValidId } from "@/lib/validate";
import { NextRequest, NextResponse } from "next/server";

const NO_CACHE = { "Cache-Control": "no-store" };
type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  if (!await getAdminFromRequest(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401, headers: NO_CACHE });
  }
  const { id } = await params;
  if (!isValidId(id)) return NextResponse.json({ error: "ID inválido" }, { status: 400, headers: NO_CACHE });
  try {
    const [cards, promotions] = await Promise.all([
      sql`SELECT id, name FROM cards WHERE bank_id = ${id} ORDER BY name`,
      sql`SELECT id FROM promotions WHERE bank_id = ${id} ORDER BY id`,
    ]);
    return NextResponse.json({ cards, promotions }, { headers: NO_CACHE });
  } catch (err) {
    console.error("GET /api/admin/data/banks/[id]/deps failed:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500, headers: NO_CACHE });
  }
}
