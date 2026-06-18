export interface AdminUser {
  id: string;
  email: string;
  password_hash: string;
  totp_secret: string;
  totp_enabled: boolean;
  created_at: string;
  last_login_at: string | null;
}

export interface AdminSessionPayload {
  adminId: string;
  email: string;
  totp_enabled: boolean;
  /**
   * token_version snapshot at sign time, for session revocation. Optional so
   * legacy tokens (issued before the feature) decode cleanly; absence is
   * treated as 0 by requireAdmin. See lib/admin-guard.ts:readTokenVersion.
   */
  tv?: number;
}
