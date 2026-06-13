"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function TotpSetupPage() {
  const router = useRouter();
  const [adminId,   setAdminId]   = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [totpUri,   setTotpUri]   = useState<string | null>(null);
  const [code,      setCode]      = useState("");
  const [error,     setError]     = useState("");
  const [loading,   setLoading]   = useState(false);
  const [loadingQr, setLoadingQr] = useState(true);

  useEffect(() => {
    fetch("/api/admin/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then(async (session) => {
        if (!session) { router.replace("/admin/login"); return; }
        if (session.totp_enabled) { router.replace("/admin"); return; }
        setAdminId(session.id);

        const qrRes = await fetch(`/api/admin/users/${session.id}/totp-setup`);
        if (qrRes.ok) {
          const data = await qrRes.json();
          setQrDataUrl(data.qr_data_url);
          setTotpUri(data.totp_uri);
        }
      })
      .finally(() => setLoadingQr(false));
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!adminId) return;
    setError("");
    setLoading(true);
    try {
      const res  = await fetch(`/api/admin/users/${adminId}/totp-setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Error"); return; }
      router.replace("/admin");
    } catch {
      setError("Error de red");
    } finally {
      setLoading(false);
    }
  }

  if (loadingQr) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100dvh" }}>
        <span style={{ color: "var(--ink-dim)", fontSize: 13 }}>Cargando…</span>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100dvh", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 420 }}>
        <div style={{ marginBottom: 28, textAlign: "center" }}>
          <span style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            color: "var(--lime)",
          }}>
            Configurar 2FA
          </span>
          <p style={{ fontSize: 13, color: "var(--ink-dim)", marginTop: 6 }}>
            Escanea el QR con Google Authenticator
          </p>
        </div>

        <div className="admin-card">
          {error && <div className="admin-error">{error}</div>}

          {qrDataUrl && (
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrDataUrl}
                alt="QR code para Google Authenticator"
                width={200}
                height={200}
                style={{ borderRadius: 8, background: "#fff", padding: 8 }}
              />
            </div>
          )}

          {totpUri && (
            <details style={{ marginBottom: 20 }}>
              <summary style={{ fontSize: 11, color: "var(--ink-dim)", cursor: "pointer", marginBottom: 6 }}>
                Agregar manualmente
              </summary>
              <code style={{
                display: "block",
                fontSize: 10,
                wordBreak: "break-all",
                color: "var(--ink-dim)",
                background: "var(--bg-3)",
                borderRadius: 6,
                padding: "8px 10px",
              }}>
                {totpUri}
              </code>
            </details>
          )}

          <form onSubmit={submit}>
            <div className="admin-form-row">
              <label className="admin-label">Código de verificación (6 dígitos)</label>
              <input
                className="admin-input"
                type="text"
                inputMode="numeric"
                maxLength={6}
                pattern="\d{6}"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                required
                style={{ letterSpacing: "0.3em", fontSize: 18, textAlign: "center" }}
              />
            </div>
            <button
              type="submit"
              disabled={loading || code.length !== 6}
              className="admin-btn admin-btn-primary"
              style={{ width: "100%", justifyContent: "center" }}
            >
              {loading ? "Activando…" : "Activar autenticación de dos factores"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
