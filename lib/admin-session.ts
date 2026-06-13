/**
 * Session token signing and cookie helpers.
 * Uses Web Crypto API (globalThis.crypto.subtle) — edge-runtime compatible.
 */

import { NextRequest, NextResponse } from "next/server";
import type { AdminSessionPayload } from "./admin-types";

export const SESSION_COOKIE = "ow_admin_session";
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;   // 8 hours
const PENDING_MFA_DURATION_MS = 5 * 60 * 1000;     // 5 minutes

// ── Encoding helpers ──────────────────────────────────────────────────────────

// new Uint8Array(number[]) always produces Uint8Array<ArrayBuffer> — edge safe.
function strToBytes(s: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array([...s].map((c) => c.charCodeAt(0)));
}

function b64uEncode(buf: ArrayBuffer): string {
  let s = "";
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function b64uDecode(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return new Uint8Array([...bin].map((c) => c.charCodeAt(0)));
}

// ── HMAC helpers ──────────────────────────────────────────────────────────────

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    strToBytes(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function getKey(): Promise<CryptoKey> {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) throw new Error("ADMIN_SESSION_SECRET no está definida");
  return importKey(secret);
}

// Token format: base64url(ascii-safe payload_json) + "." + base64url(hmac)
// The payload JSON is first base64url-encoded so the HMAC input is pure ASCII.
async function signPayload(payload: object, expiresInMs: number): Promise<string> {
  const key  = await getKey();
  const json = JSON.stringify({ ...payload, exp: Date.now() + expiresInMs });
  // Encode JSON as base64url — result is pure ASCII so strToBytes works safely
  const data = btoa(json).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  const sig  = b64uEncode(await crypto.subtle.sign("HMAC", key, strToBytes(data)));
  return `${data}.${sig}`;
}

async function verifyPayload<T extends object>(token: string): Promise<(T & { exp: number }) | null> {
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const data = token.slice(0, dot);
  const sig  = token.slice(dot + 1);
  try {
    const key   = await getKey();
    const valid = await crypto.subtle.verify("HMAC", key, b64uDecode(sig), strToBytes(data));
    if (!valid) return null;
    const payload = JSON.parse(atob(data.replace(/-/g, "+").replace(/_/g, "/"))) as T & { exp: number };
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function signSession(payload: AdminSessionPayload): Promise<string> {
  return signPayload(payload, SESSION_DURATION_MS);
}

export async function verifySession(token: string): Promise<AdminSessionPayload | null> {
  return verifyPayload<AdminSessionPayload>(token);
}

export async function signPendingMfa(adminId: string): Promise<string> {
  return signPayload({ adminId, purpose: "mfa" }, PENDING_MFA_DURATION_MS);
}

export async function verifyPendingMfa(token: string): Promise<string | null> {
  const payload = await verifyPayload<{ adminId: string; purpose: string }>(token);
  if (!payload || payload.purpose !== "mfa") return null;
  return payload.adminId;
}

// ── Cookie helpers ────────────────────────────────────────────────────────────

export function setSessionCookie(res: NextResponse, token: string): void {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/admin",
    maxAge: 8 * 60 * 60,
  });
}

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/admin",
    maxAge: 0,
  });
}

export async function getAdminFromRequest(req: NextRequest): Promise<AdminSessionPayload | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySession(token);
}
