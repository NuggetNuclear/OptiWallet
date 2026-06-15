"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { AdminShell } from "../../components/AdminShell";

interface AdminUser { id: string; email: string; totp_enabled: boolean; last_login_at: string | null }

export default function EditAdminPage() {
  const { id }  = useParams<{ id: string }>();
  const router  = useRouter();
  const [user,     setUser]     = useState<AdminUser | null>(null);
  const [password, setPassword] = useState("");
  // Step-up re-auth: the acting admin re-enters their OWN current password to
  // authorize a password change or a TOTP reset. (audit M3)
  const [currentPwForPassword, setCurrentPwForPassword] = useState("");
  const [currentPwForTotp,     setCurrentPwForTotp]     = useState("");
  const [msg,      setMsg]      = useState("");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);

  useEffect(() => {
    fetch(`/api/admin/users/${id}`)
      .then((r) => r.ok ? r.json() : null)
      .then(setUser);
  }, [id]);

  async function resetPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setMsg(""); setLoading(true);
    try {
      const res  = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_password: currentPwForPassword, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Error"); return; }
      setMsg("Contraseña actualizada"); setPassword(""); setCurrentPwForPassword("");
    } catch { setError("Error de red"); } finally { setLoading(false); }
  }

  async function resetTotp() {
    if (!confirm("¿Resetear el TOTP? El usuario deberá re-escanear el QR en su próximo login.")) return;
    setError(""); setMsg(""); setLoading(true);
    try {
      const res  = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_password: currentPwForTotp, reset_totp: true }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Error"); return; }
      setMsg("TOTP reseteado — el usuario deberá re-escanear el QR al próximo login");
      setCurrentPwForTotp("");
      setUser((u) => u ? { ...u, totp_enabled: false } : u);
    } catch { setError("Error de red"); } finally { setLoading(false); }
  }

  if (!user) return <AdminShell><p style={{ color: "var(--ink-dim)", fontSize: 13 }}>Cargando…</p></AdminShell>;

  return (
    <AdminShell>
      <div className="admin-header">
        <h1 className="admin-title">Editar admin</h1>
        <button className="admin-btn admin-btn-ghost" onClick={() => router.back()}>← Volver</button>
      </div>

      <div style={{ maxWidth: 480 }}>
        {error && <div className="admin-error">{error}</div>}
        {msg   && <div className="admin-success">{msg}</div>}

        <div className="admin-card" style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 13, color: "var(--ink-dim)", marginBottom: 4 }}>Email</p>
          <p style={{ fontWeight: 600 }}>{user.email}</p>
          <p style={{ fontSize: 11, color: "var(--ink-dim)", marginTop: 8 }}>
            2FA: <span className={`admin-badge ${user.totp_enabled ? "admin-badge-green" : "admin-badge-copper"}`}>
              {user.totp_enabled ? "Activo" : "Pendiente"}
            </span>
          </p>
        </div>

        <div className="admin-card" style={{ marginBottom: 16 }}>
          <p className="admin-label" style={{ marginBottom: 12 }}>Cambiar contraseña</p>
          <form onSubmit={resetPassword}>
            <div className="admin-form-row">
              <label className="admin-label">Tu contraseña actual</label>
              <input className="admin-input" type="password" autoComplete="current-password"
                     value={currentPwForPassword}
                     onChange={(e) => setCurrentPwForPassword(e.target.value)} required />
            </div>
            <div className="admin-form-row">
              <label className="admin-label">Nueva contraseña (mín. 12 caracteres)</label>
              <input className="admin-input" type="password" autoComplete="new-password"
                     value={password}
                     onChange={(e) => setPassword(e.target.value)} minLength={12} required />
            </div>
            <button type="submit" disabled={loading} className="admin-btn admin-btn-primary">
              {loading ? "Guardando…" : "Actualizar contraseña"}
            </button>
          </form>
        </div>

        <div className="admin-card">
          <p className="admin-label" style={{ marginBottom: 8 }}>Autenticación de dos factores</p>
          <p style={{ fontSize: 12, color: "var(--ink-dim)", marginBottom: 12 }}>
            Resetea el secreto TOTP. El usuario deberá re-escanear el QR la próxima vez que inicie sesión.
          </p>
          <div className="admin-form-row">
            <label className="admin-label">Tu contraseña actual</label>
            <input className="admin-input" type="password" autoComplete="current-password"
                   value={currentPwForTotp}
                   onChange={(e) => setCurrentPwForTotp(e.target.value)} />
          </div>
          <button className="admin-btn admin-btn-danger" onClick={resetTotp}
                  disabled={loading || currentPwForTotp.length === 0}>
            Resetear TOTP
          </button>
        </div>
      </div>
    </AdminShell>
  );
}
