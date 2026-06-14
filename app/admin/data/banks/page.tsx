"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "../../components/AdminShell";
import { DeleteModal } from "../../components/DeleteModal";

interface Bank { id: string; name: string; short_name: string | null; available: boolean }

const EMPTY: Omit<Bank, never> = { id: "", name: "", short_name: "", available: false };

export default function BanksPage() {
  const [banks,   setBanks]   = useState<Bank[]>([]);
  const [loading, setLoading] = useState(true);
  const [form,    setForm]    = useState<Bank | null>(null);
  const [isNew,   setIsNew]   = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState("");
  const [success, setSuccess] = useState("");
  const [delTarget, setDelTarget] = useState<Bank | null>(null);
  const [deps,    setDeps]    = useState<{ cards: {id:string;name:string}[]; promotions: {id:string}[] } | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function load() {
    const r = await fetch("/api/admin/data/banks");
    if (r.ok) setBanks(await r.json());
    setLoading(false);
  }
  useEffect(() => { (async () => { await load(); })(); }, []);

  function openNew() { setForm({ ...EMPTY }); setIsNew(true); setError(""); setSuccess(""); }
  function openEdit(b: Bank) { setForm({ ...b }); setIsNew(false); setError(""); setSuccess(""); }
  function cancelForm() { setForm(null); }

  async function save() {
    if (!form) return;
    setError(""); setSuccess(""); setSaving(true);
    try {
      const method = isNew ? "POST" : "PATCH";
      const url    = isNew ? "/api/admin/data/banks" : `/api/admin/data/banks/${form.id}`;
      const res    = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Error"); return; }
      setSuccess(isNew ? "Banco creado" : "Cambios guardados");
      setForm(null);
      load();
    } catch { setError("Error de red"); } finally { setSaving(false); }
  }

  async function openDelete(b: Bank) {
    setDelTarget(b);
    const r = await fetch(`/api/admin/data/banks/${b.id}/deps`);
    if (r.ok) setDeps(await r.json());
  }

  async function doDelete() {
    if (!delTarget) return;
    setDeleting(true);
    const res = await fetch(`/api/admin/data/banks/${delTarget.id}?confirmed=true`, { method: "DELETE" });
    if (res.ok) { setSuccess("Banco eliminado"); setDelTarget(null); setDeps(null); load(); }
    else { const d = await res.json(); setError(d.error ?? "Error"); setDelTarget(null); setDeps(null); }
    setDeleting(false);
  }

  return (
    <AdminShell>
      {delTarget && (
        <DeleteModal
          title={delTarget.name}
          deps={deps ? [
            { label: "Tarjetas", items: deps.cards },
            { label: "Promociones", items: deps.promotions },
          ] : undefined}
          onConfirm={doDelete}
          onCancel={() => { setDelTarget(null); setDeps(null); }}
          loading={deleting}
        />
      )}

      <div className="admin-header">
        <h1 className="admin-title">Bancos</h1>
        <button className="admin-btn admin-btn-primary" onClick={openNew}>+ Nuevo banco</button>
      </div>

      {error && <div className="admin-error">{error}</div>}
      {success && <div className="admin-success">{success}</div>}

      {form && (
        <div className="admin-card" style={{ marginBottom: 24 }}>
          <p className="admin-card-title">{isNew ? "Nuevo banco" : `Editar: ${form.id}`}</p>
          <div className="admin-form-grid">
            {isNew && (
              <div className="admin-form-row">
                <label className="admin-label">ID (slug)</label>
                <input className="admin-input" value={form.id}
                  onChange={(e) => setForm({ ...form, id: e.target.value })} placeholder="bci" />
              </div>
            )}
            <div className="admin-form-row">
              <label className="admin-label">Nombre</label>
              <input className="admin-input" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="admin-form-row">
              <label className="admin-label">Nombre corto</label>
              <input className="admin-input" value={form.short_name ?? ""}
                onChange={(e) => setForm({ ...form, short_name: e.target.value || null })} placeholder="Opcional" />
            </div>
          </div>
          <label className="admin-check-row" style={{ marginBottom: 16 }}>
            <input type="checkbox" checked={form.available}
              onChange={(e) => setForm({ ...form, available: e.target.checked })} />
            Disponible (muestra en la app)
          </label>
          <div className="admin-form-actions">
            <button className="admin-btn admin-btn-primary" onClick={save} disabled={saving}>
              {saving ? "Guardando…" : "Guardar"}
            </button>
            <button className="admin-btn admin-btn-ghost" onClick={cancelForm}>Cancelar</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="admin-loading"><span className="admin-spinner" aria-hidden="true" />Cargando…</div>
      ) : banks.length === 0 ? (
        <div className="admin-empty">
          <div className="admin-empty-icon">🏦</div>
          <div className="admin-empty-text">No hay bancos todavía. Crea el primero con “+ Nuevo banco”.</div>
        </div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th>ID</th><th>Nombre</th><th>Short name</th><th>Disponible</th><th></th></tr>
            </thead>
            <tbody>
              {banks.map((b) => (
                <tr key={b.id}>
                  <td><code className="admin-code">{b.id}</code></td>
                  <td>{b.name}</td>
                  <td className="admin-cell-dim">{b.short_name ?? "—"}</td>
                  <td><span className={`admin-badge ${b.available ? "admin-badge-green" : "admin-badge-dim"}`}>{b.available ? "Sí" : "No"}</span></td>
                  <td>
                    <div className="admin-actions">
                      <button className="admin-btn admin-btn-ghost admin-btn-sm" onClick={() => openEdit(b)}>Editar</button>
                      <button className="admin-btn admin-btn-danger admin-btn-sm" onClick={() => openDelete(b)}>Eliminar</button>
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
