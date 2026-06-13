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
    const promotions = await sql`
      SELECT p.id, b.name AS bank_name, p.discount
      FROM promotions p
      JOIN banks b ON p.bank_id = b.id
      WHERE p.merchant_id = ${id}
      ORDER BY p.discount DESC
    `;
    return NextResponse.json({ promotions }, { headers: NO_CACHE });
  } catch (err) {
    console.error("GET /api/admin/data/merchants/[id]/deps failed:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500, headers: NO_CACHE });
  }
}
