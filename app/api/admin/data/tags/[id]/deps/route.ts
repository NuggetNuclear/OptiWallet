import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-guard";
import { isValidId } from "@/lib/validate";
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
    const merchants = await sql`
      SELECT m.id, m.name FROM merchants m
      JOIN merchant_tag_map mtm ON mtm.merchant_id = m.id
      WHERE mtm.tag_id = ${id}
      ORDER BY m.name
    `;
    return NextResponse.json({ merchants }, { headers: NO_CACHE });
  } catch (err) {
    console.error("GET /api/admin/data/tags/[id]/deps failed:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500, headers: NO_CACHE });
  }
}
