"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AdminShell } from "../components/AdminShell";

// ── Types ───────────────────────────────────────────────────────────────────

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
  totals: { backlog: number; banks_total: number; banks_never_fetched: number };
}
interface MaintenanceStatus {
  enabled: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
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
  useEffect(() => { loadStatus(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
            {busy ? "Activando…" : "⚠️ Activar mantenimiento"}
          </button>
        ) : (
          <button
            className="admin-btn admin-btn-primary admin-btn-sm"
            onClick={() => toggle(false)}
            disabled={busy || loading || totpCode.length !== 6}
          >
            {busy ? "Desactivando…" : "✓ Desactivar mantenimiento"}
          </button>
        )}
        <span style={{ fontSize: 11, color: "var(--ink-dim)", fontFamily: "var(--font-jetbrains)" }}>
          ← código de tu app autenticadora
        </span>
      </div>
    </div>
  );
}

// ── Ops Center ──────────────────────────────────────────────────────────────

export default function OpsCenter() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/ops/overview")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { setData(d); setLoading(false); });
  }, []);

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
