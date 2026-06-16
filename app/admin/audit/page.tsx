"use client";

import { useEffect, useState, useMemo } from "react";
import { AdminShell } from "../components/AdminShell";

interface AuditEntry {
  id: number;
  admin_id: string;
  admin_email: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  detail: string | null;
  ip_address: string | null;
  created_at: string;
}

const ACTION_LABELS: Record<string, string> = {
  create:          "Crear",
  update:          "Actualizar",
  delete:          "Eliminar",
  login:           "Inicio de sesión",
  login_failed:    "Intento fallido",
  logout:          "Cierre de sesión",
  totp_setup:      "Configurar 2FA",
  totp_reset:      "Restablecer 2FA",
  password_change: "Cambio de contraseña",
};

const ENTITY_LABELS: Record<string, string> = {
  bank:       "Banco",
  card:       "Tarjeta",
  category:   "Categoría",
  merchant:   "Comercio",
  promotion:  "Promoción",
  admin_user: "Admin",
  auth:       "Autenticación",
};

const ACTION_BADGE: Record<string, string> = {
  create:          "admin-badge-green",
  update:          "admin-badge-dim",
  delete:          "admin-badge-copper",
  login:           "admin-badge-green",
  login_failed:    "admin-badge-copper",
  logout:          "admin-badge-dim",
  totp_setup:      "admin-badge-green",
  totp_reset:      "admin-badge-copper",
  password_change: "admin-badge-dim",
};

export default function AuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState<number>(0);
  const [filterAdmin, setFilterAdmin] = useState("");
  const [filterAction, setFilterAction] = useState("");
  const [filterEntity, setFilterEntity] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  async function loadLogs(silent = false) {
    if (!silent) {
      if (!loading) {
        setRefreshing(true);
      }
    }
    try {
      const res = await fetch("/api/admin/audit");
      if (res.ok) {
        setEntries(await res.json());
      }
    } catch (err) {
      console.error("Failed to load audit logs:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadLogs();
  }, []);

  useEffect(() => {
    if (refreshInterval <= 0) return;
    const timer = setInterval(() => {
      loadLogs(true);
    }, refreshInterval * 1000);
    return () => clearInterval(timer);
  }, [refreshInterval]);

  function handleManualRefresh() {
    loadLogs(false);
  }

  const admins = useMemo(() => {
    return Array.from(new Set(entries.map((e) => e.admin_email))).sort();
  }, [entries]);

  const actions = useMemo(() => {
    return Array.from(new Set(entries.map((e) => e.action))).sort();
  }, [entries]);

  const entities = useMemo(() => {
    return Array.from(new Set(entries.filter((e) => e.entity_type !== null).map((e) => e.entity_type as string))).sort();
  }, [entries]);

  const visible = useMemo(() => {
    return entries.filter((e) => {
      if (filterAdmin && e.admin_email !== filterAdmin) return false;
      if (filterAction && e.action !== filterAction) return false;
      if (filterEntity && e.entity_type !== filterEntity) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const detailMatch = (e.detail ?? "").toLowerCase().includes(q);
        const entityIdMatch = (e.entity_id ?? "").toLowerCase().includes(q);
        const ipMatch = (e.ip_address ?? "").toLowerCase().includes(q);
        const actionMatch = (ACTION_LABELS[e.action] ?? e.action).toLowerCase().includes(q);
        const entityTypeMatch = (e.entity_type ? (ENTITY_LABELS[e.entity_type] ?? e.entity_type) : "").toLowerCase().includes(q);
        return detailMatch || entityIdMatch || ipMatch || actionMatch || entityTypeMatch;
      }
      return true;
    });
  }, [entries, filterAdmin, filterAction, filterEntity, searchQuery]);

  return (
    <AdminShell>
      <div className="admin-header">
        <div>
          <h1 className="admin-title">Registro de actividad</h1>
          <p className="admin-subtitle">Últimos 30 días — máximo 500 entradas</p>
        </div>
      </div>

      <div className="admin-toolbar" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", flex: "1 1 auto" }}>
          <input
            className="admin-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por detalle, IP, ID..."
            style={{ maxWidth: 220, flex: "1 1 auto" }}
          />
          <select
            className="admin-input"
            value={filterAdmin}
            onChange={(e) => setFilterAdmin(e.target.value)}
            style={{ width: "auto", minWidth: 160 }}
          >
            <option value="">Todos los admins</option>
            {admins.map((adm) => (
              <option key={adm} value={adm}>{adm}</option>
            ))}
          </select>
          <select
            className="admin-input"
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            style={{ width: "auto", minWidth: 150 }}
          >
            <option value="">Todas las acciones</option>
            {actions.map((act) => (
              <option key={act} value={act}>{ACTION_LABELS[act] ?? act}</option>
            ))}
          </select>
          <select
            className="admin-input"
            value={filterEntity}
            onChange={(e) => setFilterEntity(e.target.value)}
            style={{ width: "auto", minWidth: 150 }}
          >
            <option value="">Todas las entidades</option>
            {entities.map((ent) => (
              <option key={ent} value={ent}>{ENTITY_LABELS[ent] ?? ent}</option>
            ))}
          </select>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {refreshing && <span className="admin-cell-dim" style={{ fontSize: 12 }}>Actualizando...</span>}
          <select
            className="admin-input"
            value={refreshInterval}
            onChange={(e) => setRefreshInterval(Number(e.target.value))}
            style={{ width: "auto", fontSize: 13, height: 36, padding: "0 10px" }}
          >
            <option value={0}>Auto-actualizar: Desactivado</option>
            <option value={10}>Auto-actualizar: 10 seg</option>
            <option value={30}>Auto-actualizar: 30 seg</option>
            <option value={60}>Auto-actualizar: 1 min</option>
            <option value={300}>Auto-actualizar: 5 min</option>
            <option value={600}>Auto-actualizar: 10 min</option>
          </select>
          <button
            className="admin-btn admin-btn-ghost"
            onClick={handleManualRefresh}
            disabled={loading || refreshing}
            style={{ height: 36, display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              style={refreshing ? { animation: "adminSpin 0.7s linear infinite" } : undefined}
            >
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
            </svg>
            Actualizar
          </button>
        </div>
      </div>

      {loading ? (
        <div className="admin-loading">
          <span className="admin-spinner" aria-hidden="true" />
          Cargando…
        </div>
      ) : visible.length === 0 ? (
        <div className="admin-empty">
          <div className="admin-empty-text">
            {filterAdmin || filterAction || filterEntity || searchQuery
              ? "Ninguna entrada coincide con los filtros."
              : "No hay actividad registrada en los últimos 30 días."}
          </div>
        </div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Admin</th>
                <th>Acción</th>
                <th>Entidad</th>
                <th>ID</th>
                <th>Detalle</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((e) => (
                <tr key={e.id}>
                  <td className="admin-cell-dim" style={{ fontSize: 11, whiteSpace: "nowrap" }}>
                    {new Date(e.created_at).toLocaleString("es-CL")}
                  </td>
                  <td style={{ fontSize: 12 }}>{e.admin_email}</td>
                  <td>
                    <span className={`admin-badge ${ACTION_BADGE[e.action] ?? "admin-badge-dim"}`}>
                      {ACTION_LABELS[e.action] ?? e.action}
                    </span>
                  </td>
                  <td className="admin-cell-dim" style={{ fontSize: 12 }}>
                    {e.entity_type ? (ENTITY_LABELS[e.entity_type] ?? e.entity_type) : "—"}
                  </td>
                  <td>
                    {e.entity_id ? (
                      <code className="admin-code">{e.entity_id}</code>
                    ) : (
                      <span className="admin-cell-dim">—</span>
                    )}
                  </td>
                  <td style={{ fontSize: 12, maxWidth: 280, wordBreak: "break-word" }}>
                    {e.detail ?? "—"}
                  </td>
                  <td className="admin-cell-dim" style={{ fontSize: 11 }}>
                    {e.ip_address ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminShell>
  );
}
