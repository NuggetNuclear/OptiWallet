import { sql } from "@/lib/db";
import { requireAdmin, clientIp } from "@/lib/admin-guard";
import { logAdminAction } from "@/lib/admin-log";
import { isValidId } from "@/lib/validate";
import { NextRequest, NextResponse } from "next/server";

const NO_CACHE = { "Cache-Control": "no-store" };
type Params = { params: Promise<{ id: string }> };

// POST /api/admin/data/tags/[id]/merge  { target_id }
// Fusiona el tag `id` en `target_id`: reasigna las asociaciones de comercios al
// destino (evitando duplicados) y elimina el tag origen.
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
    if (targetId === id) return NextResponse.json({ error: "No puedes fusionar un tag consigo mismo" }, { status: 400, headers: NO_CACHE });

    const [src, dst] = await Promise.all([
      sql`SELECT id FROM merchant_tags WHERE id = ${id}`,
      sql`SELECT id FROM merchant_tags WHERE id = ${targetId}`,
    ]);
    if (!src.length) return NextResponse.json({ error: "Tag origen no encontrado" }, { status: 404, headers: NO_CACHE });
    if (!dst.length) return NextResponse.json({ error: "Tag destino no encontrado" }, { status: 404, headers: NO_CACHE });

    // Comercios que ganarán el tag destino (los que lo tienen en origen pero no en destino).
    const cnt = await sql`
      SELECT COUNT(*)::int AS n FROM merchant_tag_map s
      WHERE s.tag_id = ${id}
        AND NOT EXISTS (
          SELECT 1 FROM merchant_tag_map d
          WHERE d.merchant_id = s.merchant_id AND d.tag_id = ${targetId}
        )
    `;
    const n = (cnt[0] as { n: number } | undefined)?.n ?? 0;
    // Reasignar asociaciones al destino, ignorando comercios que ya lo tienen.
    await sql`
      INSERT INTO merchant_tag_map (merchant_id, tag_id)
      SELECT merchant_id, ${targetId} FROM merchant_tag_map WHERE tag_id = ${id}
      ON CONFLICT DO NOTHING
    `;
    // Borrar el tag origen — sus filas de mapeo caen por ON DELETE CASCADE.
    await sql`DELETE FROM merchant_tags WHERE id = ${id}`;

    await logAdminAction(session, "merge", "tag", id,
      `Fusionado '${id}' → '${targetId}' (${n} comercio(s) reasignados)`, clientIp(req));
    return NextResponse.json({ status: "ok", target_id: targetId, merchants_moved: n }, { headers: NO_CACHE });
  } catch (err) {
    console.error("POST /api/admin/data/tags/[id]/merge failed:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500, headers: NO_CACHE });
  }
}
