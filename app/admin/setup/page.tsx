"use client";

import { useState } from "react";

type Step = "form" | "totp" | "done";

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

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");

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
      <div style={containerStyle}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
        <h1 style={{ color: "#d4ff3a", marginBottom: 8 }}>Todo listo</h1>
        <p style={{ color: "#aaa", marginBottom: 32 }}>
          Tu cuenta de administrador está activa y Google Authenticator está configurado.
        </p>
        <a href="/admin/login" style={buttonStyle}>
          Ir al login →
        </a>
      </div>
    );
  }

  if (step === "totp") {
    return (
      <div style={containerStyle}>
        <h1 style={{ color: "#d4ff3a", marginBottom: 4 }}>Configura Google Authenticator</h1>
        <p style={{ color: "#aaa", fontSize: 14, marginBottom: 24 }}>
          Escanea el código QR con Google Authenticator, luego ingresa el código de 6 dígitos para confirmar que está funcionando.
        </p>

        {/* QR */}
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrDataUrl}
            alt="QR TOTP"
            style={{ width: 220, height: 220, borderRadius: 8, background: "#fff", padding: 8 }}
          />
        </div>

        <details style={{ marginBottom: 24 }}>
          <summary style={{ color: "#aaa", fontSize: 13, cursor: "pointer" }}>
            ¿No puedes escanear? Usa el enlace manual
          </summary>
          <a
            href={totpUri}
            style={{ wordBreak: "break-all", color: "#d4ff3a", fontSize: 12, display: "block", marginTop: 8 }}
          >
            {totpUri}
          </a>
        </details>

        <form onSubmit={handleVerifyTotp} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <label>
            <span style={labelStyle}>Código de verificación (6 dígitos)</span>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
              required
              autoFocus
              placeholder="000000"
              style={{ ...inputStyle, fontSize: 24, letterSpacing: 8, textAlign: "center" }}
            />
          </label>

          {error && <p style={errorStyle}>{error}</p>}

          <button type="submit" disabled={loading || totpCode.length !== 6} style={buttonStyle}>
            {loading ? "Verificando..." : "Confirmar y activar"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <h1 style={{ color: "#d4ff3a", marginBottom: 4 }}>Crear administrador</h1>
      <p style={{ color: "#aaa", fontSize: 14, marginBottom: 28 }}>
        Solo funciona si no hay admins registrados aún.
      </p>

      <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <label>
          <span style={labelStyle}>Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={inputStyle}
            placeholder="admin@ejemplo.com"
          />
        </label>

        <label>
          <span style={labelStyle}>Contraseña (mín. 8 caracteres)</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            style={inputStyle}
            placeholder="••••••••"
          />
        </label>

        <label>
          <span style={labelStyle}>Vuelve a introducir tu contraseña</span>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={8}
            style={{
              ...inputStyle,
              borderColor: confirmPassword && confirmPassword !== password
                ? "#ff6b6b"
                : confirmPassword && confirmPassword === password
                  ? "#d4ff3a"
                  : "rgba(245,241,232,0.2)",
            }}
            placeholder="••••••••"
          />
          {confirmPassword && confirmPassword !== password && (
            <span style={{ color: "#ff6b6b", fontSize: 12, marginTop: 4, display: "block" }}>
              Las contraseñas no coinciden
            </span>
          )}
        </label>

        {error && <p style={errorStyle}>{error}</p>}

        <button
          type="submit"
          disabled={loading || !password || password !== confirmPassword}
          style={{
            ...buttonStyle,
            opacity: loading || !password || password !== confirmPassword ? 0.5 : 1,
            cursor: loading || !password || password !== confirmPassword ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Creando..." : "Crear y configurar 2FA →"}
        </button>
      </form>
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  fontFamily: "sans-serif",
  maxWidth: 440,
  margin: "60px auto",
  padding: "0 20px",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: 6,
  fontSize: 13,
  color: "#aaa",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  background: "#13161a",
  border: "1px solid rgba(245,241,232,0.2)",
  borderRadius: 6,
  color: "#f5f1e8",
  fontSize: 15,
  boxSizing: "border-box",
};

const errorStyle: React.CSSProperties = {
  color: "#ff6b6b",
  background: "#2a1a1a",
  padding: "10px 14px",
  borderRadius: 6,
  margin: 0,
  fontSize: 14,
};

const buttonStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: "13px",
  background: "#d4ff3a",
  color: "#0b0d0c",
  border: "none",
  borderRadius: 6,
  fontWeight: 700,
  fontSize: 15,
  cursor: "pointer",
  textAlign: "center",
  textDecoration: "none",
  marginTop: 8,
};
