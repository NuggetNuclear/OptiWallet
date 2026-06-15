import { clearSessionCookie, getAdminFromRequest } from "@/lib/admin-session";
import { bumpTokenVersion } from "@/lib/admin-guard";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  // Bump token_version so a copy of this session token (e.g. one captured before
  // logout) can't be replayed for the remaining cookie lifetime. Best-effort and
  // safe on a pre-migration DB. Clearing the cookie still happens regardless. (audit L1)
  const session = await getAdminFromRequest(req);
  if (session) await bumpTokenVersion(session.adminId);

  const res = NextResponse.json({ status: "ok" });
  clearSessionCookie(res);
  return res;
}
