"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AdminShell } from "../components/AdminShell";
import { DeleteModal } from "../components/DeleteModal";

interface AdminUser {
  id: string;
  email: string;
  totp_enabled: boolean;
  created_at: string;
  last_login_at: string | null;
}

export default function AdminUsersPage() {
  const [users,   setUsers]   = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [error, setError] = useState("");

  async function load() {
    const res = await fetch("/api/admin/users");
    if (res.ok) setUsers(await res.json());
    setLoading(false);
  }

  useEffect(() => { (async () => { await load(); })(); }, []);

  async function doDelete() {
    if (!deleteTarget) return;
    setDeleting(deleteTarget.id);
    const res = await fetch(`/api/admin/users/${deleteTarget.id}`, { method: "DELETE" });
    if (res.ok) {
      setDeleteTarget(null);
      load();
    } else {
      const data = await res.json();
      setError(data.error ?? "Error");
      setDeleteTarget(null);
    }
    setDeleting(null);
  }

  return (
    <AdminShell>
      {deleteTarget && (
        <DeleteModal
          title={deleteTarget.email}
          onConfirm={doDelete}
          onCancel={() => setDeleteTarget(null)}
          loading={!!deleting}
        />
      )}

      <div className="admin-header">
        <div>
          <h1 className="admin-title">Administradores</h1>
          <p className="admin-subtitle">Cuentas con acceso al panel</p>
        </div>
        <Link href="/admin/users/new">
          <button className="admin-btn admin-btn-primary">+ Nuevo admin</button>
        </Link>
      </div>

      {error && <div className="admin-error">{error}</div>}

      {loading ? (
        <div className="admin-loading"><span className="admin-spinner" aria-hidden="true" />Cargando…</div>
      ) : users.length === 0 ? (
        <div className="admin-empty">
          <div className="admin-empty-text">No hay administradores. Crea el primero con &quot;+ Nuevo admin&quot;.</div>
        </div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>ID</th>
                <th>2FA</th>
                <th>Último acceso</th>
                <th>Creado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.email}</td>
                  <td><code className="admin-code">{u.id}</code></td>
                  <td>
                    <span className={`admin-badge ${u.totp_enabled ? "admin-badge-green" : "admin-badge-copper"}`}>
                      {u.totp_enabled ? "Activo" : "Pendiente"}
                    </span>
                  </td>
                  <td className="admin-cell-dim" style={{ fontSize: 12 }}>
                    {u.last_login_at ? new Date(u.last_login_at).toLocaleString("es-CL") : "—"}
                  </td>
                  <td className="admin-cell-dim" style={{ fontSize: 12 }}>
                    {new Date(u.created_at).toLocaleDateString("es-CL")}
                  </td>
                  <td>
                    <div className="admin-actions">
                      <Link href={`/admin/users/${u.id}`}>
                        <button className="admin-btn admin-btn-ghost admin-btn-sm">Editar</button>
                      </Link>
                      <button
                        className="admin-btn admin-btn-danger admin-btn-sm"
                        onClick={() => setDeleteTarget(u)}
                      >
                        Eliminar
                      </button>
                    </div>
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
