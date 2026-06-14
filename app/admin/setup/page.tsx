"use client";

import { useState } from "react";

type Step = "form" | "totp" | "done";

// Kept in sync with the setup API (lib/admin-guard MIN_PASSWORD).
const MIN_PASSWORD = 12;

export default function SetupPage() {
  const [step, setStep] = useState<Step>("form");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [adminId, setAdminId] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [totpUri, setTotpUri] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const mismatch = confirmPassword.length > 0 && confirmPassword !== password;
  const tooShort = password.length > 0 && password.length < MIN_PASSWORD;
  const canSubmit = password.length >= MIN_PASSWORD && password === confirmPassword;

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < MIN_PASSWORD) {
      setError(`La contraseña debe tener al menos ${MIN_PASSWORD} caracteres`);
      return;
    }
    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/admin/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Error desconocido");
      } else {
        setAdminId(data.id);
        setQrDataUrl(data.qr_data_url);
        setTotpUri(data.totp_uri);
        setStep("totp");
      }
    } catch {
      setError("Error de red");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyTotp(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", admin_id: adminId, code: totpCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Código incorrecto");
      } else {
        setStep("done");
      }
    } catch {
      setError("Error de red");
    } finally {
      setLoading(false);
    }
  }

  if (step === "done") {
    return (
      <div className="admin-auth">
        <div className="admin-auth-inner" style={{ textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
          <h1 className="admin-auth-title">Todo listo</h1>
          <p className="admin-auth-sub" style={{ marginBottom: 28 }}>
            Tu cuenta de administrador está activa y Google Authenticator está configurado.
          </p>
          <a href="/admin/login" className="admin-btn admin-btn-primary admin-btn-block">
            Ir al login →
          </a>
        </div>
      </div>
    );
  }

  if (step === "totp") {
    return (
      <div className="admin-auth">
        <div className="admin-auth-inner">
          <div className="admin-auth-head">
            <span className="admin-auth-eyebrow">Paso 2 de 2</span>
            <h1 className="admin-auth-title">Configura Google Authenticator</h1>
            <p className="admin-auth-sub">
              Escanea el QR, luego ingresa el código de 6 dígitos para confirmar.
            </p>
          </div>

          <div className="admin-card">
            {error && <div className="admin-error">{error}</div>}

            <div style={{ textAlign: "center", marginBottom: 20 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrDataUrl} alt="QR TOTP" className="admin-qr" />
            </div>

            <details style={{ marginBottom: 20 }}>
              <summary className="admin-summary">¿No puedes escanear? Usa el enlace manual</summary>
              <a href={totpUri} className="admin-manual-uri">{totpUri}</a>
            </details>

            <form onSubmit={handleVerifyTotp}>
              <div className="admin-form-row">
                <label className="admin-label">Código de verificación (6 dígitos)</label>
                <input
                  className="admin-input admin-input-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="\d{6}"
                  maxLength={6}
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                  required
                  autoFocus
                  placeholder="000000"
                />
              </div>
              <button
                type="submit"
                disabled={loading || totpCode.length !== 6}
                className="admin-btn admin-btn-primary admin-btn-block"
              >
                {loading ? "Verificando…" : "Confirmar y activar"}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-auth">
      <div className="admin-auth-inner">
        <div className="admin-auth-head">
          <span className="admin-auth-eyebrow">Paso 1 de 2</span>
          <h1 className="admin-auth-title">Crear administrador</h1>
          <p className="admin-auth-sub">Solo funciona si no hay admins registrados aún.</p>
        </div>

        <div className="admin-card">
          {error && <div className="admin-error">{error}</div>}

          <form onSubmit={handleCreate}>
            <div className="admin-form-row">
              <label className="admin-label">Email</label>
              <input
                className="admin-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="username"
                placeholder="admin@ejemplo.com"
              />
            </div>

            <div className="admin-form-row">
              <label className="admin-label">Contraseña (mín. {MIN_PASSWORD} caracteres)</label>
              <input
                className={`admin-input ${tooShort ? "invalid" : ""}`}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={MIN_PASSWORD}
                autoComplete="new-password"
                placeholder="••••••••••••"
              />
            </div>

            <div className="admin-form-row">
              <label className="admin-label">Vuelve a introducir tu contraseña</label>
              <input
                className={`admin-input ${mismatch ? "invalid" : confirmPassword && !mismatch ? "valid" : ""}`}
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={MIN_PASSWORD}
                autoComplete="new-password"
                placeholder="••••••••••••"
              />
              {mismatch && (
                <span style={{ color: "var(--copper)", fontSize: 12, marginTop: 6, display: "block" }}>
                  Las contraseñas no coinciden
                </span>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || !canSubmit}
              className="admin-btn admin-btn-primary admin-btn-block"
            >
              {loading ? "Creando…" : "Crear y configurar 2FA →"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
