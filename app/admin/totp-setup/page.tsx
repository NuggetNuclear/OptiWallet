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
      <div className="admin-loading">
        <span className="admin-spinner" aria-hidden="true" />
        Cargando…
      </div>
    );
  }

  return (
    <div className="admin-auth">
      <div className="admin-auth-inner">
        <div className="admin-auth-head">
          <span className="admin-auth-eyebrow">Configurar 2FA</span>
          <p className="admin-auth-sub">Escanea el código QR con tu aplicación autenticadora</p>
        </div>

        <div className="admin-card">
          {error && <div className="admin-error">{error}</div>}

          {qrDataUrl && (
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrDataUrl}
                alt="Código QR para aplicación autenticadora"
                width={200}
                height={200}
                className="admin-qr"
              />
            </div>
          )}

          {totpUri && (
            <details style={{ marginBottom: 20 }}>
              <summary className="admin-summary">Agregar manualmente</summary>
              <code className="admin-manual-uri">{totpUri}</code>
            </details>
          )}

          <form onSubmit={submit}>
            <div className="admin-form-row">
              <label className="admin-label">Código de verificación (6 dígitos)</label>
              <input
                className="admin-input admin-input-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                pattern="\d{6}"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading || code.length !== 6}
              className="admin-btn admin-btn-primary admin-btn-block"
            >
              {loading ? "Activando…" : "Activar autenticación de dos factores"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
