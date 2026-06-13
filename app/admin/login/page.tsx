"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

type Step = "password" | "totp";

export default function AdminLoginPage() {
  const router = useRouter();
  const [step,      setStep]      = useState<Step>("password");
  const [email,     setEmail]     = useState("");
  const [password,  setPassword]  = useState("");
  const [code,      setCode]      = useState("");
  const [mfaToken,  setMfaToken]  = useState("");
  const [error,     setError]     = useState("");
  const [loading,   setLoading]   = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);

  // Redirect if already logged in
  useEffect(() => {
    fetch("/api/admin/auth/me").then((r) => {
      if (r.ok) router.replace("/admin");
    });
  }, [router]);

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res  = await fetch("/api/admin/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Error"); return; }

      if (data.status === "mfa_required") {
        setMfaToken(data.mfa_token);
        setStep("totp");
        setTimeout(() => codeRef.current?.focus(), 50);
      } else {
        router.replace(data.totp_enabled === false ? "/admin/totp-setup" : "/admin");
      }
    } catch {
      setError("Error de red");
    } finally {
      setLoading(false);
    }
  }

  async function submitTotp(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res  = await fetch("/api/admin/auth/verify-totp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mfa_token: mfaToken, code }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Código inválido"); return; }
      router.replace("/admin");
    } catch {
      setError("Error de red");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "100dvh",
      padding: "20px",
    }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ marginBottom: 32, textAlign: "center" }}>
          <span style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            color: "var(--lime)",
          }}>
            OptiWallet Admin
          </span>
          <p style={{ fontSize: 13, color: "var(--ink-dim)", marginTop: 6 }}>
            {step === "password" ? "Inicia sesión" : "Código de verificación"}
          </p>
        </div>

        <div className="admin-card">
          {error && <div className="admin-error">{error}</div>}

          {step === "password" ? (
            <form onSubmit={submitPassword}>
              <div className="admin-form-row">
                <label className="admin-label">Email</label>
                <input
                  className="admin-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="username"
                  required
                />
              </div>
              <div className="admin-form-row">
                <label className="admin-label">Contraseña</label>
                <input
                  className="admin-input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="admin-btn admin-btn-primary"
                style={{ width: "100%", justifyContent: "center", marginTop: 8 }}
              >
                {loading ? "Verificando…" : "Continuar"}
              </button>
            </form>
          ) : (
            <form onSubmit={submitTotp}>
              <p style={{ fontSize: 13, color: "var(--ink-dim)", marginBottom: 20 }}>
                Ingresa el código de 6 dígitos de Google Authenticator.
              </p>
              <div className="admin-form-row">
                <label className="admin-label">Código TOTP</label>
                <input
                  ref={codeRef}
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
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button
                  type="submit"
                  disabled={loading || code.length !== 6}
                  className="admin-btn admin-btn-primary"
                  style={{ flex: 1, justifyContent: "center" }}
                >
                  {loading ? "Verificando…" : "Verificar"}
                </button>
                <button
                  type="button"
                  className="admin-btn admin-btn-ghost"
                  onClick={() => { setStep("password"); setCode(""); setError(""); }}
                >
                  Atrás
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
