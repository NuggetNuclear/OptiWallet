import { sql } from "@/lib/db";
import { hashPassword, generateTotpSecret } from "@/lib/admin-auth";
import { requireAdmin } from "@/lib/admin-guard";
import { NextRequest, NextResponse } from "next/server";

const NO_CACHE = { "Cache-Control": "no-store" };

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const session = await requireAdmin(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401, headers: NO_CACHE });

  const { id } = await params;
  try {
    const rows = await sql`
      SELECT id, email, totp_enabled, created_at, last_login_at
      FROM admin_users WHERE id = ${id}
    `;
    if (!rows.length) return NextResponse.json({ error: "No encontrado" }, { status: 404, headers: NO_CACHE });
    return NextResponse.json(rows[0], { headers: NO_CACHE });
  } catch (err) {
    console.error("GET /api/admin/users/[id] failed:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500, headers: NO_CACHE });
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await requireAdmin(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401, headers: NO_CACHE });

  const { id } = await params;
  try {
    const body = await req.json().catch(() => null);
    const { password, reset_totp } = body ?? {};

    if (password !== undefined) {
      if (typeof password !== "string" || password.length < 12) {
        return NextResponse.json({ error: "La contraseña debe tener al menos 12 caracteres" }, { status: 400, headers: NO_CACHE });
      }
      const hash = await hashPassword(password);
      await sql`UPDATE admin_users SET password_hash = ${hash} WHERE id = ${id}`;
    }

    if (reset_totp === true) {
      const newSecret = generateTotpSecret();
      await sql`UPDATE admin_users SET totp_secret = ${newSecret}, totp_enabled = false WHERE id = ${id}`;
    }

    return NextResponse.json({ status: "ok" }, { headers: NO_CACHE });
  } catch (err) {
    console.error("PATCH /api/admin/users/[id] failed:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500, headers: NO_CACHE });
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await requireAdmin(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401, headers: NO_CACHE });

  const { id } = await params;

  if (session.adminId === id) {
    return NextResponse.json({ error: "No puedes eliminarte a ti mismo" }, { status: 400, headers: NO_CACHE });
  }

  try {
    const count = await sql`SELECT COUNT(*)::int AS n FROM admin_users`;
    if ((count[0] as { n: number }).n <= 1) {
      return NextResponse.json({ error: "No puedes eliminar el último administrador" }, { status: 400, headers: NO_CACHE });
    }

    await sql`DELETE FROM admin_users WHERE id = ${id}`;
    return NextResponse.json({ status: "ok" }, { headers: NO_CACHE });
  } catch (err) {
    console.error("DELETE /api/admin/users/[id] failed:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500, headers: NO_CACHE });
  }
}
