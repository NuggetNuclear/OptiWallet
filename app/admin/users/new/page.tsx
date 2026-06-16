"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AdminShell } from "../../components/AdminShell";

export default function NewAdminPage() {
  const router = useRouter();
  const [email,     setEmail]     = useState("");
  const [password,  setPassword]  = useState("");
  const [error,     setError]     = useState("");
  const [loading,   setLoading]   = useState(false);
  const [created,   setCreated]   = useState<{ qr_data_url: string; totp_uri: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res  = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Error"); return; }
      setCreated(data);
    } catch {
      setError("Error de red");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AdminShell>
      <div className="admin-header">
        <h1 className="admin-title">Nuevo administrador</h1>
      </div>

      {!created ? (
        <div style={{ maxWidth: 480 }}>
          <div className="admin-card">
            {error && <div className="admin-error">{error}</div>}
            <form onSubmit={submit}>
              <div className="admin-form-row">
                <label className="admin-label">Email</label>
                <input className="admin-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="admin-form-row">
                <label className="admin-label">Contraseña (mín. 12 caracteres)</label>
                <input className="admin-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={12} required />
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                <button type="submit" disabled={loading} className="admin-btn admin-btn-primary">
                  {loading ? "Creando…" : "Crear admin"}
                </button>
                <button type="button" className="admin-btn admin-btn-ghost" onClick={() => router.back()}>
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : (
        <div style={{ maxWidth: 480 }}>
          <div className="admin-success">Admin creado. El usuario deberá escanear este QR al iniciar sesión.</div>
          <div className="admin-card" style={{ textAlign: "center" }}>
            <p style={{ fontSize: 13, color: "var(--ink-dim)", marginBottom: 16 }}>
              Muestra este QR al nuevo administrador para configurar Google Authenticator:
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={created.qr_data_url} alt="QR TOTP" width={200} height={200} className="admin-qr" />
            <details style={{ marginTop: 16, textAlign: "left" }}>
              <summary className="admin-summary">URI manual</summary>
              <code className="admin-manual-uri">{created.totp_uri}</code>
            </details>
            <button className="admin-btn admin-btn-primary" style={{ marginTop: 20 }} onClick={() => router.push("/admin/users")}>
              Volver a admins
            </button>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
