import { sql } from "@/lib/db";
import { hashPassword, verifyPassword, generateTotpSecret } from "@/lib/admin-auth";
import { encryptSecret } from "@/lib/admin-crypto";
import { requireAdmin, clientIp, isRateLimited, recordFailedAttempt, bumpTokenVersion } from "@/lib/admin-guard";
import { logAdminAction } from "@/lib/admin-log";
import { NextRequest, NextResponse } from "next/server";

const NO_CACHE = { "Cache-Control": "no-store" };
// Constant-time decoy so a wrong/empty current password costs the same as a
// missing acting admin — no timing signal.
const FAKE_HASH = "$2b$12$invalidhashtopreventtimingattacks.invalidhash";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const session = await requireAdmin(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401, headers: NO_CACHE });

  const { id } = await params;
  try {
    const rows = await sql`
      SELECT id, email, name, totp_enabled, created_at, last_login_at
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
  const ip = clientIp(req);
  try {
    // Managing ANOTHER admin is root-only, and a root account can only be
    // managed by itself — this stops a non-root (or a second root) from
    // resetting the root's password/2FA and hijacking or locking it out.
    // Managing your OWN account stays open to everyone (with the step-up below).
    const isSelf = id === session.adminId;
    if (!isSelf) {
      if (!session.is_root) {
        return NextResponse.json({ error: "Solo un administrador raíz puede modificar otras cuentas" }, { status: 403, headers: NO_CACHE });
      }
      const target = await sql`SELECT is_root FROM admin_users WHERE id = ${id}`;
      if (!target.length) {
        return NextResponse.json({ error: "No encontrado" }, { status: 404, headers: NO_CACHE });
      }
      if ((target[0] as { is_root: boolean }).is_root) {
        return NextResponse.json({ error: "Esta cuenta raíz está protegida y solo puede gestionarse a sí misma" }, { status: 403, headers: NO_CACHE });
      }
    }

    const body = await req.json().catch(() => null);
    const { current_password, password, reset_totp, name } = body ?? {};

    const changesPassword = password !== undefined;
    const resetsTotp = reset_totp === true;
    const changesName = name !== undefined;

    // El nombre no es un dato sensible (a diferencia de contraseña/2FA), así
    // que no exige el step-up de current_password — solo el chequeo de
    // permisos (isSelf o root) que ya corrió arriba.
    if (changesName) {
      if (typeof name !== "string" || name.trim().length === 0) {
        return NextResponse.json({ error: "El nombre no puede estar vacío" }, { status: 400, headers: NO_CACHE });
      }
    }

    // Step-up re-authentication: changing a password or resetting 2FA — for
    // yourself OR another admin — requires the ACTING admin to re-enter their own
    // current password. A hijacked session (stolen cookie) alone can no longer
    // silently take over an account. Throttled on the shared IP budget.
    if (changesPassword || resetsTotp) {
      if (await isRateLimited(ip)) {
        return NextResponse.json({ error: "Demasiados intentos. Espera 15 minutos." }, { status: 429, headers: NO_CACHE });
      }
      if (typeof current_password !== "string" || current_password.length === 0) {
        return NextResponse.json({ error: "Debes confirmar tu contraseña actual" }, { status: 400, headers: NO_CACHE });
      }
      const meRows = await sql`SELECT password_hash FROM admin_users WHERE id = ${session.adminId}`;
      const me = meRows[0] as { password_hash: string } | undefined;
      const ok = await verifyPassword(current_password, me?.password_hash ?? FAKE_HASH);
      if (!me || !ok) {
        await recordFailedAttempt(ip);
        return NextResponse.json({ error: "Contraseña actual incorrecta" }, { status: 401, headers: NO_CACHE });
      }
    }

    if (changesPassword) {
      if (typeof password !== "string" || password.length < 12) {
        return NextResponse.json({ error: "La contraseña debe tener al menos 12 caracteres" }, { status: 400, headers: NO_CACHE });
      }
      const hash = await hashPassword(password);
      await sql`UPDATE admin_users SET password_hash = ${hash} WHERE id = ${id}`;
      // Invalidate the target's outstanding sessions after a password change.
      await bumpTokenVersion(id);
      await logAdminAction(session, "password_change", "admin_user", id, `Contraseña cambiada para admin ${id}`, ip);
    }

    if (resetsTotp) {
      const newSecret = generateTotpSecret();
      await sql`UPDATE admin_users SET totp_secret = ${encryptSecret(newSecret)}, totp_enabled = false WHERE id = ${id}`;
      await logAdminAction(session, "totp_reset", "admin_user", id, `2FA restablecido para admin ${id}`, ip);
    }

    if (changesName) {
      await sql`UPDATE admin_users SET name = ${(name as string).trim()} WHERE id = ${id}`;
      await logAdminAction(session, "update", "admin_user", id, `Nombre actualizado para admin ${id}`, ip);
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

  // Eliminar cuentas es una acción reservada al admin raíz.
  if (!session.is_root) {
    return NextResponse.json({ error: "Solo un administrador raíz puede eliminar cuentas" }, { status: 403, headers: NO_CACHE });
  }

  const { id } = await params;

  if (session.adminId === id) {
    return NextResponse.json({ error: "No puedes eliminarte a ti mismo" }, { status: 400, headers: NO_CACHE });
  }

  try {
    const count = await sql`SELECT COUNT(*)::int AS n FROM admin_users`;
    if ((count[0] as { n: number }).n <= 1) {
      return NextResponse.json({ error: "No puedes eliminar el último administrador" }, { status: 400, headers: NO_CACHE });
    }

    const emailRow = await sql`SELECT email, is_root FROM admin_users WHERE id = ${id}`;
    if (!emailRow.length) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404, headers: NO_CACHE });
    }
    if ((emailRow[0] as { is_root: boolean }).is_root) {
      return NextResponse.json({ error: "Este administrador está protegido y no puede ser eliminado" }, { status: 400, headers: NO_CACHE });
    }

    await sql`DELETE FROM admin_users WHERE id = ${id}`;
    await logAdminAction(session, "delete", "admin_user", id, `Admin "${emailRow[0]?.email ?? id}" eliminado`, clientIp(req));
    return NextResponse.json({ status: "ok" }, { headers: NO_CACHE });
  } catch (err) {
    console.error("DELETE /api/admin/users/[id] failed:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500, headers: NO_CACHE });
  }
}
