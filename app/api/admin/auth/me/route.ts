import { getAdminFromRequest } from "@/lib/admin-session";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const session = await getAdminFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  return NextResponse.json({
    id: session.adminId,
    email: session.email,
    totp_enabled: session.totp_enabled,
  });
}
