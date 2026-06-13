"use client";

import { useState } from "react";

export default function SetupPage() {
  const [setupToken, setSetupToken] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [result, setResult] = useState<{ qr_data_url: string; totp_uri: string; id: string } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Hidden if ADMIN_SETUP_TOKEN is not set — API returns 404
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setup_token: setupToken, email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Error desconocido");
      } else {
        setResult(data);
      }
    } catch {
      setError("Error de red");
    } finally {
      setLoading(false);
    }
  }

  if (result) {
    return (
      <div style={{ fontFamily: "sans-serif", maxWidth: 480, margin: "40px auto", padding: "0 20px" }}>
        <h1 style={{ color: "#d4ff3a" }}>✓ Admin creado</h1>
        <p><strong>ID:</strong> {result.id}</p>
        <p><strong>Email:</strong> {email}</p>

        <h2 style={{ marginTop: 32 }}>1. Escanea este QR con Google Authenticator</h2>
        <p style={{ color: "#aaa", fontSize: 14 }}>
          Abre Google Authenticator → "+" → "Escanear código QR"
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={result.qr_data_url} alt="TOTP QR Code" style={{ width: 240, height: 240, display: "block", margin: "16px 0" }} />

        <h2 style={{ marginTop: 24 }}>2. O toca este enlace para agregar manualmente</h2>
        <a
          href={result.totp_uri}
          style={{ wordBreak: "break-all", color: "#d4ff3a", fontSize: 13 }}
        >
          {result.totp_uri}
        </a>

        <div style={{ background: "#1a1f1c", border: "1px solid #d4ff3a", borderRadius: 8, padding: 16, marginTop: 32 }}>
          <strong>⚠️ Próximos pasos (importante):</strong>
          <ol style={{ marginTop: 8, paddingLeft: 20, lineHeight: 2 }}>
            <li>Agrega el QR a Google Authenticator <em>ahora</em></li>
            <li>Ve a Vercel → Settings → Environment Variables</li>
            <li><strong>Elimina</strong> la variable <code>ADMIN_SETUP_TOKEN</code></li>
            <li>Redeploy (o espera el próximo deploy)</li>
            <li>Ve a <a href="/admin/login" style={{ color: "#d4ff3a" }}>/admin/login</a> para ingresar</li>
          </ol>
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "sans-serif", maxWidth: 420, margin: "60px auto", padding: "0 20px" }}>
      <h1 style={{ color: "#d4ff3a" }}>Setup inicial de OptiWallet</h1>
      <p style={{ color: "#aaa" }}>Crea el primer administrador. Esta página solo funciona mientras <code>ADMIN_SETUP_TOKEN</code> esté definida en Vercel.</p>

      <form onSubmit={handleSubmit} style={{ marginTop: 32, display: "flex", flexDirection: "column", gap: 16 }}>
        <label>
          <span style={{ display: "block", marginBottom: 4, fontSize: 13, color: "#aaa" }}>Setup token (el valor de ADMIN_SETUP_TOKEN)</span>
          <input
            type="password"
            value={setupToken}
            onChange={(e) => setSetupToken(e.target.value)}
            required
            style={inputStyle}
            placeholder="Tu ADMIN_SETUP_TOKEN"
          />
        </label>

        <label>
          <span style={{ display: "block", marginBottom: 4, fontSize: 13, color: "#aaa" }}>Email del admin</span>
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
          <span style={{ display: "block", marginBottom: 4, fontSize: 13, color: "#aaa" }}>Contraseña (mín. 8 caracteres)</span>
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

        {error && (
          <p style={{ color: "#ff6b6b", background: "#2a1a1a", padding: "10px 14px", borderRadius: 6, margin: 0 }}>
            {error}
          </p>
        )}

        <button type="submit" disabled={loading} style={buttonStyle}>
          {loading ? "Creando..." : "Crear administrador"}
        </button>
      </form>
    </div>
  );
}

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

const buttonStyle: React.CSSProperties = {
  padding: "12px",
  background: "#d4ff3a",
  color: "#0b0d0c",
  border: "none",
  borderRadius: 6,
  fontWeight: 700,
  fontSize: 15,
  cursor: "pointer",
  marginTop: 8,
};
