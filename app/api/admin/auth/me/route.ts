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
      SELECT email, name, totp_enabled, token_version, is_root FROM admin_users WHERE id = ${session.adminId}
    `;
    const user = rows[0] as { email: string; name: string; totp_enabled: boolean; token_version?: number; is_root?: boolean } | undefined;
    if (!user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401, headers: NO_CACHE });
    }

    // Session revocation check for GET /me.
    // Bumping token_version immediately invalidates sessions at UI level.
    if ((session.tv ?? 0) !== Number(user.token_version ?? 0)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401, headers: NO_CACHE });
    }

    return NextResponse.json(
      {
        id: session.adminId,
        email: user.email,
        name: user.name,
        totp_enabled: user.totp_enabled,
        is_root: Boolean(user.is_root),
      },
      { headers: NO_CACHE },
    );
  } catch (err) {
    console.error("GET /api/admin/auth/me failed:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500, headers: NO_CACHE });
  }
}
