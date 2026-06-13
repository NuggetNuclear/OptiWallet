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
}
