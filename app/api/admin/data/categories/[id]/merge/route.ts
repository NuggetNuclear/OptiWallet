import { sql } from "@/lib/db";
import { requireAdmin, clientIp } from "@/lib/admin-guard";
import { logAdminAction } from "@/lib/admin-log";
import { isValidId } from "@/lib/validate";
import { NextRequest, NextResponse } from "next/server";

const NO_CACHE = { "Cache-Control": "no-store" };
type Params = { params: Promise<{ id: string }> };

// POST /api/admin/data/categories/[id]/merge  { target_id }
// Fusiona la categoría `id` en `target_id`: reasigna todos sus comercios al
// destino y elimina la categoría origen. Generaliza el rename-cascade.
export async function POST(req: NextRequest, { params }: Params) {
  const session = await requireAdmin(req);
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401, headers: NO_CACHE });
  }
  const { id } = await params;
  if (!isValidId(id)) return NextResponse.json({ error: "ID inválido" }, { status: 400, headers: NO_CACHE });
  try {
    const body = await req.json().catch(() => null);
    const targetId = typeof body?.target_id === "string" ? body.target_id.trim() : "";

    if (!isValidId(targetId)) return NextResponse.json({ error: "target_id inválido" }, { status: 400, headers: NO_CACHE });
    if (targetId === id) return NextResponse.json({ error: "No puedes fusionar una categoría consigo misma" }, { status: 400, headers: NO_CACHE });

    const [src, dst] = await Promise.all([
      sql`SELECT id, label FROM merchant_categories WHERE id = ${id}`,
      sql`SELECT id FROM merchant_categories WHERE id = ${targetId}`,
    ]);
    if (!src.length) return NextResponse.json({ error: "Categoría origen no encontrada" }, { status: 404, headers: NO_CACHE });
    if (!dst.length) return NextResponse.json({ error: "Categoría destino no encontrada" }, { status: 404, headers: NO_CACHE });

    // El driver de Neon no expone rowCount de forma fiable en tagged templates,
    // así que contamos antes de reasignar (mismo patrón que el rename-cascade).
    const cnt = await sql`SELECT COUNT(*)::int AS n FROM merchants WHERE category_id = ${id}`;
    const n = (cnt[0] as { n: number } | undefined)?.n ?? 0;
    await sql`UPDATE merchants SET category_id = ${targetId} WHERE category_id = ${id}`;
    await sql`DELETE FROM merchant_categories WHERE id = ${id}`;

    await logAdminAction(session, "merge", "category", id,
      `Fusionada '${id}' → '${targetId}' (${n} comercio(s) movidos)`, clientIp(req));
    return NextResponse.json({ status: "ok", target_id: targetId, merchants_moved: n }, { headers: NO_CACHE });
  } catch (err) {
    console.error("POST /api/admin/data/categories/[id]/merge failed:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500, headers: NO_CACHE });
  }
}
