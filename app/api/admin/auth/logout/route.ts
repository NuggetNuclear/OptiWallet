import { clearSessionCookie } from "@/lib/admin-session";
import { NextResponse } from "next/server";

export async function POST() {
  const res = NextResponse.json({ status: "ok" });
  clearSessionCookie(res);
  return res;
}
