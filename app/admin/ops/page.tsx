"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AdminShell } from "../components/AdminShell";
// ── Types ───────────────────────────────────────────────────────────────────

interface FetchConfig {
  /** Muestra modal de confirmación con pasos antes de iniciar el fetch. */
  walkthrough?: {
    steps: string[];
    warning?: string;
    estimatedTime?: string;
  };
}

interface BankRow {
  id: string;
  name: string;
  available: boolean;
  pending: number;
  rejected: number;
  active_promos: number;
  last_fetch: string | null;
  last_imported: number | null;
  last_total: number | null;
  last_edges: number | null;
}
interface Overview {
  banks: BankRow[];
  totals: { backlog: number; banks_total: number; banks_never_fetched: number; pending_reports: number };
}
interface MaintenanceStatus {
  enabled: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}
interface FetchResult {
  run_id: number;
  raw_entries?: number; // solo presente en el endpoint JSON (Banco de Chile)
  total: number;
  imported: number;
  skipped: number;
  edge_count: number;
  edge_counts?: Record<string, number>;
}
interface CookieRequired {
  error: "cookie_required";
  message: string;
  instructions: string[];
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(d: string | null): string {
  if (!d) return "Nunca";
  const dt = new Date(d);
  const days = Math.floor((Date.now() - dt.getTime()) / 86_400_000);
  const rel = days <= 0 ? "hoy" : days === 1 ? "ayer" : `hace ${days} d`;
  return `${dt.toLocaleDateString("es-CL")} · ${rel}`;
}

function fmtDatetime(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" });
}

// ── Maintenance Mode Panel ──────────────────────────────────────────────────

function MaintenancePanel() {
  const [status, setStatus] = useState<MaintenanceStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [totpCode, setTotpCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function loadStatus() {
    const r = await fetch("/api/admin/maintenance");
    if (r.ok) setStatus(await r.json());
    setLoading(false);
  }
  useEffect(() => { loadStatus(); }, []); // eslint-disable-line react-hooks/set-state-in-effect

  async function toggle(enable: boolean) {
    if (totpCode.length !== 6) { setError("Ingresa el código TOTP de 6 dígitos"); return; }
    setBusy(true); setError(""); setSuccess("");
    try {
      const r = await fetch("/api/admin/maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: enable, totp_code: totpCode }),
      });
      const data = await r.json();
      if (!r.ok) { setError(data.error ?? "Error"); return; }
      setSuccess(enable ? "⚠️ Modo mantenimiento ACTIVADO — los usuarios ven /mantencion" : "✓ Modo mantenimiento DESACTIVADO");
      setTotpCode("");
      await loadStatus();
    } catch { setError("Error de red"); }
    finally { setBusy(false); }
  }

  const isOn = status?.enabled ?? false;

  return (
    <div
      className="admin-card"
      style={{
        marginBottom: 24,
        border: isOn ? "1px solid var(--copper)" : "1px solid var(--line)",
        background: isOn ? "rgba(214,120,70,0.06)" : undefined,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              display: "inline-block",
              width: 10, height: 10,
              borderRadius: "50%",
              background: isOn ? "var(--copper)" : "var(--lime)",
              boxShadow: isOn ? "0 0 8px var(--copper)" : "0 0 8px var(--lime)",
              flexShrink: 0,
            }}
          />
          <span style={{ fontWeight: 700, fontSize: 14 }}>
            Modo mantenimiento{" "}
            <span style={{ color: isOn ? "var(--copper)" : "var(--lime)", fontFamily: "var(--font-jetbrains)", fontSize: 12 }}>
              {loading ? "…" : isOn ? "ACTIVO" : "INACTIVO"}
            </span>
          </span>
        </div>
        {status?.updatedAt && (
          <span style={{ fontSize: 11, color: "var(--ink-dim)", fontFamily: "var(--font-jetbrains)" }}>
            Último cambio: {fmtDatetime(status.updatedAt)}
            {status.updatedBy ? ` · ${status.updatedBy}` : ""}
          </span>
        )}
      </div>

      <p style={{ fontSize: 12, color: "var(--ink-dim)", marginBottom: 14, maxWidth: 520 }}>
        Cuando está activo, todos los usuarios son redirigidos a{" "}
        <code className="admin-code">/mantencion</code>. El panel admin sigue accesible.
        Se requiere TOTP en cada cambio de estado.
      </p>

      {error && <div className="admin-error" style={{ marginBottom: 10 }}>{error}</div>}
      {success && <div className="admin-success" style={{ marginBottom: 10 }}>{success}</div>}

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <input
          className="admin-input admin-input-code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          pattern="\d{6}"
          placeholder="000000"
          value={totpCode}
          onChange={(e) => { setTotpCode(e.target.value.replace(/\D/g, "")); setError(""); setSuccess(""); }}
          style={{ width: 100 }}
          disabled={busy || loading}
        />
        {!isOn ? (
          <button
            className="admin-btn admin-btn-sm"
            style={{ background: "var(--copper)", color: "#fff", border: "none" }}
            onClick={() => toggle(true)}
            disabled={busy || loading || totpCode.length !== 6}
          >
            {busy ? "Activando…" : "Activar mantenimiento"}
          </button>
        ) : (
          <button
            className="admin-btn admin-btn-primary admin-btn-sm"
            onClick={() => toggle(false)}
            disabled={busy || loading || totpCode.length !== 6}
          >
            {busy ? "Desactivando…" : "Desactivar mantenimiento"}
          </button>
        )}
        <span style={{ fontSize: 11, color: "var(--ink-dim)", fontFamily: "var(--font-jetbrains)" }}>
          ← código de tu app autenticadora
        </span>
      </div>
    </div>
  );
}

// ── Fetch Button + Cookie Modal ─────────────────────────────────────────────

function FetchButton({
  bankId, bankName, config = {}, onFetched,
}: {
  bankId: string;
  bankName: string;
  config?: FetchConfig;
  onFetched: () => void;
}) {
  const [state, setState] = useState<"idle" | "confirm" | "fetching" | "cookie" | "success" | "error">("idle");
  const [cookieValue, setCookieValue] = useState("");
  const [instructions, setInstructions] = useState<string[]>([]);
  const [result, setResult] = useState<FetchResult | null>(null);
  const [error, setError] = useState("");

  async function doFetch(cookie?: string) {
    setState("fetching");
    setError("");
    try {
      const res = await fetch("/api/admin/ops/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bank_id: bankId, cookie: cookie || undefined }),
      });

      if (res.status === 428) {
        // Cookie required — show modal.
        const data: CookieRequired = await res.json();
        setInstructions(data.instructions || []);
        setState("cookie");
        return;
      }

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Error desconocido");
        setState("error");
        return;
      }

      setResult(data as FetchResult);
      setState("success");
      onFetched();
    } catch {
      setError("Error de red al contactar el servidor");
      setState("error");
    }
  }

  function handleCookieSubmit() {
    if (!cookieValue.trim()) return;
    doFetch(cookieValue.trim());
  }

  function reset() {
    setState("idle");
    setResult(null);
    setError("");
    setCookieValue("");
    setInstructions([]);
  }

  // ── Inline button (default state) ──
  if (state === "idle") {
    const hasWalkthrough = !!config.walkthrough;
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {config.walkthrough?.estimatedTime && (
          <span style={{ fontSize: 10, color: "var(--ink-dim)", fontFamily: "var(--font-jetbrains)" }}>
            ~{config.walkthrough.estimatedTime}
          </span>
        )}
        <button
          className="admin-btn admin-btn-ghost admin-btn-sm"
          onClick={() => hasWalkthrough ? setState("confirm") : doFetch()}
          title={`Fetch automático desde ${bankName}`}
        >
          Fetch
        </button>
      </div>
    );
  }

  // ── Pre-confirm walkthrough modal ──
  if (state === "confirm" && config.walkthrough) {
    const wt = config.walkthrough;
    return (
      <>
        <div className="admin-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) reset(); }}>
          <div className="admin-modal" style={{ width: 520 }}>
            <p className="admin-modal-title">Fetch automático — {bankName}</p>

            <p style={{ fontSize: 13, color: "var(--ink-dim)", marginBottom: 14 }}>
              El scraper hará lo siguiente:
            </p>

            <div style={{
              background: "var(--bg-3, rgba(245,241,232,0.04))",
              borderRadius: 8,
              padding: "12px 14px",
              marginBottom: 14,
              fontSize: 12,
              color: "var(--ink-dim)",
              lineHeight: 1.9,
            }}>
              {wt.steps.map((step, i) => (
                <div key={i} style={{ display: "flex", gap: 8 }}>
                  <span style={{ color: "var(--lime)", fontWeight: 700, fontFamily: "var(--font-jetbrains)", flexShrink: 0 }}>
                    {i + 1}.
                  </span>
                  <span>{step}</span>
                </div>
              ))}
            </div>

            {(wt.warning || wt.estimatedTime) && (
              <div style={{
                display: "flex", flexDirection: "column", gap: 6,
                background: "rgba(214,120,70,0.07)",
                border: "1px solid rgba(214,120,70,0.25)",
                borderRadius: 7,
                padding: "10px 13px",
                marginBottom: 18,
                fontSize: 12,
              }}>
                {wt.estimatedTime && (
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span style={{ color: "var(--copper)" }}>⏱</span>
                    <span>
                      <strong style={{ color: "var(--ink)" }}>Tiempo estimado:</strong>{" "}
                      <span style={{ fontFamily: "var(--font-jetbrains)", color: "var(--copper)" }}>
                        {wt.estimatedTime}
                      </span>
                      {" — no cerrar la pestaña mientras dura el proceso."}
                    </span>
                  </div>
                )}
                {wt.warning && (
                  <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                    <span style={{ color: "var(--copper)", flexShrink: 0 }}>⚠</span>
                    <span style={{ color: "var(--ink-dim)" }}>{wt.warning}</span>
                  </div>
                )}
              </div>
            )}

            {error && <div className="admin-error" style={{ marginBottom: 10 }}>{error}</div>}

            <div className="admin-form-actions">
              <button
                className="admin-btn admin-btn-primary"
                onClick={() => { setState("idle"); doFetch(); }}
              >
                Iniciar fetch
              </button>
              <button className="admin-btn admin-btn-ghost" onClick={reset}>
                Cancelar
              </button>
            </div>
          </div>
        </div>

        {/* Keep a visible placeholder in the table row */}
        <button className="admin-btn admin-btn-ghost admin-btn-sm" disabled>
          ⚡ Fetch
        </button>
      </>
    );
  }

  // ── Loading state ──
  if (state === "fetching") {
    return (
      <button className="admin-btn admin-btn-ghost admin-btn-sm" disabled style={{ gap: 6 }}>
        <span className="admin-spinner" style={{ width: 12, height: 12, borderWidth: 1.5 }} aria-hidden="true" />
        {config.walkthrough?.estimatedTime
          ? `Scrapeando… (~${config.walkthrough.estimatedTime})`
          : "Scrapeando…"}
      </button>
    );
  }

  // ── Error state ──
  if (state === "error") {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 11, color: "var(--copper)" }}>{error}</span>
        <button className="admin-btn admin-btn-ghost admin-btn-sm" onClick={reset}>
          Reintentar
        </button>
      </div>
    );
  }

  // ── Success state ──
  if (state === "success" && result) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span className="admin-badge admin-badge-green" style={{ fontSize: 10 }}>
          +{result.imported} a staging
        </span>
        {result.skipped > 0 && (
          <span style={{ fontSize: 10, color: "var(--ink-dim)", fontFamily: "var(--font-jetbrains)" }}>
            {result.skipped} dup
          </span>
        )}
        <Link href={`/admin/ops/${bankId}`} className="admin-btn admin-btn-primary admin-btn-sm" style={{ fontSize: 10 }}>
          Revisar →
        </Link>
        <button className="admin-btn admin-btn-ghost admin-btn-sm" onClick={reset} style={{ fontSize: 10 }}>
          ✕
        </button>
      </div>
    );
  }

  // ── Cookie modal ──
  if (state === "cookie") {
    return (
      <>
        <div className="admin-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) reset(); }}>
          <div className="admin-modal" style={{ width: 540 }}>
            <p className="admin-modal-title">🔐 Cookie de Imperva requerida</p>

            <p style={{ fontSize: 13, color: "var(--ink-dim)", marginBottom: 16 }}>
              El sitio de <strong style={{ color: "var(--ink)" }}>{bankName}</strong> bloqueó la conexión directa (anti-bot).
              Para continuar, pega la cookie de tu navegador:
            </p>

            <div style={{
              background: "var(--bg-3, rgba(245,241,232,0.04))",
              borderRadius: 8,
              padding: "12px 14px",
              marginBottom: 16,
              fontSize: 12,
              color: "var(--ink-dim)",
              lineHeight: 1.8,
            }}>
              {instructions.length > 0 ? (
                instructions.map((step, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, marginBottom: 2 }}>
                    <span style={{ color: "var(--lime)", fontWeight: 700, fontFamily: "var(--font-jetbrains)", flexShrink: 0 }}>
                      {step.slice(0, 2)}
                    </span>
                    <span>{step.slice(3)}</span>
                  </div>
                ))
              ) : (
                <>
                  <div>1. Abre el sitio del banco en tu navegador</div>
                  <div>2. DevTools → Network → copia el header &quot;Cookie&quot;</div>
                  <div>3. Pégala abajo</div>
                </>
              )}
            </div>

            <div className="admin-form-row">
              <label className="admin-label">Cookie header</label>
              <textarea
                className="admin-input"
                rows={4}
                placeholder="visid_incap_...; incap_ses_...; reese84=..."
                value={cookieValue}
                onChange={(e) => setCookieValue(e.target.value)}
                style={{ fontFamily: "var(--font-jetbrains)", fontSize: 11 }}
                autoFocus
              />
            </div>

            {error && <div className="admin-error">{error}</div>}

            <div className="admin-form-actions">
              <button
                className="admin-btn admin-btn-primary"
                onClick={handleCookieSubmit}
                disabled={!cookieValue.trim() || state !== "cookie"}
              >
                Reintentar con cookie
              </button>
              <button className="admin-btn admin-btn-ghost" onClick={reset}>
                Cancelar
              </button>
            </div>

            <p style={{ fontSize: 10, color: "var(--ink-dim)", marginTop: 12, fontFamily: "var(--font-jetbrains)" }}>
              La cookie se guarda para futuros fetches. Expira en unas horas según Imperva.
            </p>
          </div>
        </div>

        {/* Keep a visible button in the table row */}
        <button className="admin-btn admin-btn-ghost admin-btn-sm" disabled style={{ gap: 6 }}>
          <span className="admin-spinner" style={{ width: 12, height: 12, borderWidth: 1.5 }} aria-hidden="true" />
          Cookie…
        </button>
      </>
    );
  }

  return null;
}

// ── Scrapers disponibles ────────────────────────────────────────────────────

/**
 * Bancos con scraper configurado en fetch/route.ts → soportan auto-fetch
 * desde el panel. La config de cada uno controla el UX (walkthrough, tiempo).
 */
const FETCHABLE_BANKS: Record<string, FetchConfig> = {
  "banco-chile": {},
};

/**
 * Bancos que solo tienen scraper local (no se pueden ejecutar desde el panel).
 * Muestra un badge informativo en vez de un botón de fetch.
 */
const SCRIPT_ONLY_BANKS = new Set(["bci", "itau"]);

// ── Ops Center ──────────────────────────────────────────────────────────────

export default function OpsCenter() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);

  function loadOverview() {
    fetch("/api/admin/ops/overview")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { setData(d); setLoading(false); });
  }

  useEffect(() => { loadOverview(); }, []);

  const t = data?.totals;

  return (
    <AdminShell>
      <div className="admin-header">
        <div>
          <h1 className="admin-title">Central de operaciones</h1>
          <p className="admin-subtitle">Scraping → staging → revisión → promociones</p>
        </div>
        <Link href="/admin/ops/import" className="admin-btn admin-btn-primary">+ Importar datos</Link>
      </div>

      {/* ── Maintenance mode ── */}
      <MaintenancePanel />

      {t && (
        <div className="admin-stats">
          <div className="admin-card admin-stat">
            <div className="admin-stat-value" style={{ color: t.backlog > 0 ? "var(--lime)" : undefined }}>{t.backlog}</div>
            <div className="admin-stat-label">Promos por revisar</div>
          </div>
          <div className="admin-card admin-stat">
            <div className="admin-stat-value">{t.banks_never_fetched}</div>
            <div className="admin-stat-label">Bancos sin fetch</div>
          </div>
          <div className="admin-card admin-stat">
            <div className="admin-stat-value">{t.banks_total}</div>
            <div className="admin-stat-label">Bancos totales</div>
          </div>
          <Link href="/admin/ops/reports" className="admin-card admin-stat" style={{ textDecoration: "none" }}>
            <div className="admin-stat-value" style={{ color: t.pending_reports > 0 ? "var(--copper)" : undefined }}>{t.pending_reports}</div>
            <div className="admin-stat-label">Reportes pendientes →</div>
          </Link>
        </div>
      )}

      {loading ? (
        <div className="admin-loading"><span className="admin-spinner" aria-hidden="true" />Cargando…</div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Banco</th>
                <th>Por revisar</th>
                <th>En producción</th>
                <th>Último fetch</th>
                <th>Casos borde</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data?.banks.map((b) => (
                <tr key={b.id}>
                  <td style={{ fontSize: 13, fontWeight: 600 }}>
                    {b.name}
                    {!b.available && <span className="admin-badge admin-badge-dim" style={{ marginLeft: 8 }}>oculto</span>}
                  </td>
                  <td>
                    {b.pending > 0
                      ? <span className="admin-badge admin-badge-green">{b.pending}</span>
                      : <span className="admin-cell-dim">0</span>}
                  </td>
                  <td className="admin-cell-dim">{b.active_promos}</td>
                  <td className="admin-cell-dim" style={{ fontSize: 11 }}>{fmtDate(b.last_fetch)}</td>
                  <td className="admin-cell-dim" style={{ fontSize: 11 }}>{b.last_edges ?? "—"}</td>
                  <td>
                    <div className="admin-actions">
                      {b.id in FETCHABLE_BANKS ? (
                        <FetchButton
                          bankId={b.id}
                          bankName={b.name}
                          config={FETCHABLE_BANKS[b.id]}
                          onFetched={loadOverview}
                        />
                      ) : SCRIPT_ONLY_BANKS.has(b.id) ? (
                        <span
                          className="admin-badge admin-badge-dim"
                          title="Corre el script local y sube el JSON"
                          style={{ cursor: "default", fontSize: 10 }}
                        >
                          script local
                        </span>
                      ) : null}
                      <Link href={`/admin/ops/${b.id}`} className="admin-btn admin-btn-ghost admin-btn-sm">
                        Revisar →
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p style={{ fontSize: 11, color: "var(--ink-dim)", marginTop: 16, fontFamily: "var(--font-jetbrains)" }}>
        Los casos borde (cashback, 2x1, multitramo, etc.) quedan fuera del staging — se manejan aparte. Ver
        {" "}<code className="admin-code">scripts/scrapers/out/</code>.
      </p>
    </AdminShell>
  );
}
