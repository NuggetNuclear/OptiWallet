"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AdminShell } from "../components/AdminShell";

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

function fmtDate(d: string | null): string {
  if (!d) return "Nunca";
  const dt = new Date(d);
  const days = Math.floor((Date.now() - dt.getTime()) / 86_400_000);
  const rel = days <= 0 ? "hoy" : days === 1 ? "ayer" : `hace ${days} d`;
  return `${dt.toLocaleDateString("es-CL")} · ${rel}`;
}

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
