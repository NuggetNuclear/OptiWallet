"use client";

import { useEffect, useState } from "react";
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
  logout:          "admin-badge-dim",
  totp_setup:      "admin-badge-green",
  totp_reset:      "admin-badge-copper",
  password_change: "admin-badge-dim",
};

export default function AuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState("");

  useEffect(() => {
    fetch("/api/admin/audit")
      .then((r) => (r.ok ? r.json() : []))
      .then(setEntries)
      .finally(() => setLoading(false));
  }, []);

  const visible = filter
    ? entries.filter(
        (e: AuditEntry) =>
          e.admin_email.toLowerCase().includes(filter.toLowerCase()) ||
          e.action.includes(filter.toLowerCase()) ||
          (e.entity_id ?? "").toLowerCase().includes(filter.toLowerCase()) ||
          (e.detail ?? "").toLowerCase().includes(filter.toLowerCase()),
      )
    : entries;

  return (
    <AdminShell>
      <div className="admin-header">
        <div>
          <h1 className="admin-title">Registro de actividad</h1>
          <p className="admin-subtitle">Últimos 30 días — máximo 500 entradas</p>
        </div>
      </div>

      <div className="admin-toolbar">
        <input
          className="admin-input"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filtrar por admin, acción, entidad…"
          style={{ maxWidth: 320 }}
        />
      </div>

      {loading ? (
        <div className="admin-loading">
          <span className="admin-spinner" aria-hidden="true" />
          Cargando…
        </div>
      ) : visible.length === 0 ? (
        <div className="admin-empty">
          <div className="admin-empty-text">
            {filter ? "Ninguna entrada coincide con el filtro." : "No hay actividad registrada en los últimos 30 días."}
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
