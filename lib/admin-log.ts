import "server-only";
import { sql } from "./db";
import type { AdminSessionPayload } from "./admin-types";

export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "login"
  | "login_failed"
  | "logout"
  | "totp_setup"
  | "totp_reset"
  | "password_change"
  | "import"
  | "approve"
  | "reject"
  | "merge"
  | "maintenance_on"
  | "maintenance_off";

export type AuditEntity =
  | "bank"
  | "card"
  | "category"
  | "tag"
  | "merchant"
  | "promotion"
  | "admin_user"
  | "auth"
  | "scraper_run"
  | "promo_staging"
  | "app_settings";

export async function logAdminAction(
  session: AdminSessionPayload,
  action: AuditAction,
  entityType: AuditEntity,
  entityId: string | null,
  detail: string,
  ip = "unknown",
): Promise<void> {
  try {
    await sql`
      INSERT INTO admin_audit_log (admin_id, admin_email, action, entity_type, entity_id, detail, ip_address)
      VALUES (${session.adminId}, ${session.email}, ${action}, ${entityType}, ${entityId}, ${detail}, ${ip})
    `;
  } catch (err) {
    console.error("audit log write failed:", err);
  }
}
