import { sql } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-guard";
import { logAdminAction } from "@/lib/admin-log";
import { clientIp } from "@/lib/admin-guard";
import { isValidId } from "@/lib/validate";
import { NextRequest, NextResponse } from "next/server";

const NO_CACHE = { "Cache-Control": "no-store" };

export async function GET(req: NextRequest) {
  if (!await requireAdmin(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401, headers: NO_CACHE });
  }
  try {
    const rows = await sql`SELECT id, name, short_name, available, color FROM banks ORDER BY name ASC`;
    return NextResponse.json(rows, { headers: NO_CACHE });
  } catch (err) {
    console.error("GET /api/admin/data/banks failed:", err);
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
    const { id, name, short_name, available, color } = body ?? {};

    if (!id || !isValidId(id)) return NextResponse.json({ error: "ID inválido" }, { status: 400, headers: NO_CACHE });
    if (!name || typeof name !== "string") return NextResponse.json({ error: "name requerido" }, { status: 400, headers: NO_CACHE });
    if (color !== undefined && color !== null && (typeof color !== "string" || !/^#[0-9A-Fa-f]{6}$/.test(color))) {
      return NextResponse.json({ error: "Color inválido (debe ser hex de 6 dígitos, ej: #FF0000)" }, { status: 400, headers: NO_CACHE });
    }

    await sql`
      INSERT INTO banks (id, name, short_name, available, color)
      VALUES (${id}, ${name}, ${short_name ?? null}, ${available ?? false}, ${color ?? null})
    `;
    await logAdminAction(session, "create", "bank", id, `Banco "${name}" creado`, clientIp(req));
    return NextResponse.json({ id }, { status: 201, headers: NO_CACHE });
  } catch (err) {
    console.error("POST /api/admin/data/banks failed:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500, headers: NO_CACHE });
  }
}
