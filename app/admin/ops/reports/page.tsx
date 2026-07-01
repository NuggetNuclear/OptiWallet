"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AdminShell } from "../../components/AdminShell";
import { AdminFloatingAction } from "../../components/AdminFloatingAction";

interface ReportGroup {
  promotion_id: string;
  merchant_id: string;
  bank_id: string;
  merchant_name: string | null;
  bank_name: string | null;
  discount: number | null;
  discount_per_unit: number | null;
  end_date: string | null;
  active: boolean;
  report_count: number;
  r_expired: number;
  r_wrong_discount: number;
  r_not_found: number;
  r_other: number;
  r_unspecified: number;
  last_at: string;
  notes: string[];
}

type Status = "pending" | "resolved" | "dismissed";
type Triage = { priority: "high" | "med" | "low"; likely_dead: boolean; rationale: string };

const STATUS_TABS: { key: Status; label: string }[] = [
  { key: "pending", label: "Pendientes" },
  { key: "resolved", label: "Resueltos" },
  { key: "dismissed", label: "Descartados" },
];

const REASON_LABELS: { key: keyof ReportGroup; label: string }[] = [
  { key: "r_expired", label: "vencida" },
  { key: "r_wrong_discount", label: "desc. incorrecto" },
  { key: "r_not_found", label: "no existe" },
  { key: "r_other", label: "otro" },
  { key: "r_unspecified", label: "sin motivo" },
];

const PRIO_RANK = { high: 0, med: 1, low: 2 } as const;

function todayISO() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
}

function isExpired(endDate: string | null): boolean {
  if (!endDate) return false;
  return String(endDate).slice(0, 10) < todayISO();
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `hace ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h}h`;
  return `hace ${Math.floor(h / 24)}d`;
}

// Heurística sin IA: prioridad por volumen + vencimiento.
function heuristicPriority(r: ReportGroup): "high" | "med" | "low" {
  if (isExpired(r.end_date) || r.report_count >= 5 || r.r_not_found >= 3) return "high";
  if (r.report_count >= 2) return "med";
  return "low";
}

export default function ReportsPage() {
  const [rows, setRows] = useState<ReportGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<Status>("pending");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [triage, setTriage] = useState<Record<string, Triage>>({});
  const [triaging, setTriaging] = useState(false);

  async function load(s: Status) {
    setLoading(true);
    setTriage({});
    try {
      const r = await fetch(`/api/admin/ops/reports?status=${s}`);
      if (r.ok) setRows(await r.json());
      else setRows([]);
    } catch (err) {
      console.error("Error loading reports:", err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { (async () => { await load(status); })(); }, [status]);

  async function act(url: string, promotionId: string, okMsg: string) {
    setError(""); setSuccess(""); setBusy(promotionId);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ promotion_id: promotionId, status: "resolved" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error ?? "Error"); return; }
      setSuccess(okMsg); load(status);
    } catch { setError("Error de red"); } finally { setBusy(null); }
  }

  async function dismiss(promotionId: string) {
    setError(""); setSuccess(""); setBusy(promotionId);
    try {
      const res = await fetch("/api/admin/ops/reports/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ promotion_id: promotionId, status: "dismissed" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error ?? "Error"); return; }
      setSuccess("Reportes descartados"); load(status);
    } catch { setError("Error de red"); } finally { setBusy(null); }
  }

  async function runTriage() {
    setError(""); setSuccess(""); setTriaging(true);
    try {
      const res = await fetch("/api/admin/ops/reports/triage", { method: "POST" });
      if (res.status === 503) { setError("IA no configurada — usando orden heurístico."); return; }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error ?? "Error"); return; }
      const map: Record<string, Triage> = {};
      for (const t of data.triage ?? []) map[t.promotion_id] = t;
      setTriage(map);
      setSuccess(`IA priorizó ${Object.keys(map).length} promo(s).`);
    } catch { setError("Error de red"); } finally { setTriaging(false); }
  }

  // Orden efectivo: IA si existe, si no la heurística.
  const ordered = useMemo(() => {
    const prioOf = (r: ReportGroup) => triage[r.promotion_id]?.priority ?? heuristicPriority(r);
    return [...rows].sort((a, b) => {
      const pa = PRIO_RANK[prioOf(a)], pb = PRIO_RANK[prioOf(b)];
      if (pa !== pb) return pa - pb;
      return b.report_count - a.report_count;
    });
  }, [rows, triage]);

  return (
    <AdminShell>
      <div className="admin-header">
        <h1 className="admin-title">Reportes de usuarios</h1>
        {status === "pending" && (
          <AdminFloatingAction>
            <button className="admin-btn admin-btn-primary" onClick={runTriage} disabled={triaging || rows.length === 0}>
              {triaging ? "Priorizando…" : "✦ Priorizar con IA"}
            </button>
          </AdminFloatingAction>
        )}
      </div>

      <p style={{ fontSize: 13, color: "var(--ink-dim)", marginBottom: 16 }}>
        Cuando un usuario toca 👎 en una promo, se registra aquí. Agrupados por promoción y
        ordenados por prioridad (volumen + vencimiento; la IA lo refina si está configurada).
      </p>

      <div className="admin-toolbar" style={{ gap: 8 }}>
        {STATUS_TABS.map((t) => (
          <button
            key={t.key}
            className={`admin-btn admin-btn-sm ${status === t.key ? "admin-btn-primary" : "admin-btn-ghost"}`}
            onClick={() => setStatus(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <div className="admin-error">{error}</div>}
      {success && <div className="admin-success">{success}</div>}

      {loading ? (
        <div className="admin-loading"><span className="admin-spinner" aria-hidden="true" />Cargando…</div>
      ) : ordered.length === 0 ? (
        <div className="admin-empty">
          <div className="admin-empty-text">No hay reportes {status === "pending" ? "pendientes" : status === "resolved" ? "resueltos" : "descartados"}.</div>
        </div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th>Promo</th><th>Descuento</th><th>Reportes</th><th>Motivos</th><th>Última</th><th></th></tr>
            </thead>
            <tbody>
              {ordered.map((r) => {
                const t = triage[r.promotion_id];
                const prio = t?.priority ?? heuristicPriority(r);
                const dead = t?.likely_dead || isExpired(r.end_date);
                return (
                  <tr key={r.promotion_id}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span className={`admin-badge ${prio === "high" ? "admin-badge-copper" : "admin-badge-dim"}`}>{prio}</span>
                        <strong>{r.merchant_name ?? r.merchant_id}</strong>
                        {!r.active && <span className="admin-badge admin-badge-dim">inactiva</span>}
                        {dead && <span className="admin-badge admin-badge-copper">probablemente muerta</span>}
                      </div>
                      <div className="admin-cell-dim" style={{ fontSize: 11 }}>
                        {r.bank_name ?? r.bank_id} · <code className="admin-code">{r.promotion_id}</code>
                        {r.end_date && <> · vence {String(r.end_date).slice(0, 10)}</>}
                      </div>
                      {t?.rationale && <div style={{ fontSize: 11, color: "var(--ink-dim)", marginTop: 2, fontStyle: "italic" }}>✦ {t.rationale}</div>}
                    </td>
                    <td className="admin-cell-dim">
                      {r.discount != null ? `${r.discount}%` : r.discount_per_unit != null ? `$${r.discount_per_unit}/L` : "—"}
                    </td>
                    <td><strong>{r.report_count}</strong></td>
                    <td style={{ fontSize: 11 }}>
                      {REASON_LABELS.filter((rl) => (r[rl.key] as number) > 0).map((rl) => (
                        <span key={rl.label} className="admin-badge admin-badge-dim" style={{ marginRight: 4 }}>
                          {rl.label} {r[rl.key] as number}
                        </span>
                      ))}
                    </td>
                    <td className="admin-cell-dim" style={{ fontSize: 11 }}>{timeAgo(r.last_at)}</td>
                    <td>
                      <div className="admin-actions">
                        <Link
                          className="admin-btn admin-btn-primary admin-btn-sm"
                          title="Abrir esta promo en el editor para revisarla o corregirla"
                          href={`/admin/data/promotions?bankId=${encodeURIComponent(r.bank_id)}&merchantId=${encodeURIComponent(r.merchant_id)}&edit=${encodeURIComponent(r.promotion_id)}`}
                        >
                          Revisar / editar
                        </Link>
                        {status === "pending" && (
                          <>
                            {r.active && (
                              <button className="admin-btn admin-btn-danger admin-btn-sm" disabled={busy === r.promotion_id}
                                title="Bajar la promo (active=false) y dar por resueltos sus reportes"
                                onClick={() => act("/api/admin/ops/reports/deactivate", r.promotion_id, "Promo desactivada")}>
                                Desactivar
                              </button>
                            )}
                            <button className="admin-btn admin-btn-ghost admin-btn-sm" disabled={busy === r.promotion_id}
                              title="Ya la revisaste/corregiste: marcar los reportes como resueltos"
                              onClick={() => act("/api/admin/ops/reports/resolve", r.promotion_id, "Reportes resueltos")}>
                              Marcar resuelto
                            </button>
                            <button className="admin-btn admin-btn-ghost admin-btn-sm" disabled={busy === r.promotion_id}
                              title="Reporte inválido o irrelevante: descartar sin tocar la promo"
                              onClick={() => dismiss(r.promotion_id)}>
                              Descartar
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </AdminShell>
  );
}
