import { sql } from "@/lib/db";
import { getAdminFromRequest } from "@/lib/admin-session";
import { NextRequest, NextResponse } from "next/server";

const NO_CACHE = { "Cache-Control": "no-store" };

export async function GET(req: NextRequest) {
  const session = await getAdminFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401, headers: NO_CACHE });
  }

  try {
    // Reflect live DB state, not the (up to 8h old) cookie payload: a deleted
    // account 401s, and a reset TOTP reports totp_enabled=false so the client
    // redirects to enrollment — mirroring the requireAdmin() guard on the API.
    const rows = await sql`
      SELECT email, totp_enabled FROM admin_users WHERE id = ${session.adminId}
    `;
    const user = rows[0] as { email: string; totp_enabled: boolean } | undefined;
    if (!user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401, headers: NO_CACHE });
    }

    return NextResponse.json(
      {
        id: session.adminId,
        email: user.email,
        totp_enabled: user.totp_enabled,
      },
      { headers: NO_CACHE },
    );
  } catch (err) {
    console.error("GET /api/admin/auth/me failed:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500, headers: NO_CACHE });
  }
}
