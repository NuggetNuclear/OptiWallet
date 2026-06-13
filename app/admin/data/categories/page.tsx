"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "../../components/AdminShell";
import { DeleteModal } from "../../components/DeleteModal";

interface Category { id: string; label: string; emoji: string; merchant_count?: number }

const EMPTY: Category = { id: "", label: "", emoji: "" };

export default function CategoriesPage() {
  const [cats,    setCats]    = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [form,    setForm]    = useState<Category | null>(null);
  const [isNew,   setIsNew]   = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState("");
  const [delTarget, setDelTarget] = useState<Category | null>(null);
  const [deps,    setDeps]    = useState<{ merchants: {id:string;name:string}[] } | null>(null);
  const [deleting,  setDeleting]  = useState(false);

  async function load() {
    const r = await fetch("/api/admin/data/categories");
    if (r.ok) setCats(await r.json());
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function openNew()             { setForm({ ...EMPTY }); setIsNew(true);  setError(""); }
  function openEdit(c: Category) { setForm({ ...c });     setIsNew(false); setError(""); }

  async function save() {
    if (!form) return;
    setError(""); setSaving(true);
    try {
      const method = isNew ? "POST" : "PATCH";
      const url    = isNew ? "/api/admin/data/categories" : `/api/admin/data/categories/${form.id}`;
      const res    = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Error"); return; }
      setForm(null); load();
    } catch { setError("Error de red"); } finally { setSaving(false); }
  }

  async function openDelete(c: Category) {
    setDelTarget(c);
    const r = await fetch(`/api/admin/data/categories/${c.id}/deps`);
    if (r.ok) setDeps(await r.json());
  }

  async function doDelete() {
    if (!delTarget) return;
    setDeleting(true);
    const res = await fetch(`/api/admin/data/categories/${delTarget.id}?confirmed=true`, { method: "DELETE" });
    if (res.ok) { setDelTarget(null); setDeps(null); load(); }
    else { const d = await res.json(); setError(d.error ?? "Error"); setDelTarget(null); setDeps(null); }
    setDeleting(false);
  }

  return (
    <AdminShell>
      {delTarget && (
        <DeleteModal
          title={delTarget.label}
          deps={deps ? [{ label: "Comercios", items: deps.merchants }] : undefined}
          onConfirm={doDelete}
          onCancel={() => { setDelTarget(null); setDeps(null); }}
          loading={deleting}
        />
      )}

      <div className="admin-header">
        <h1 className="admin-title">Categorías</h1>
        <button className="admin-btn admin-btn-primary" onClick={openNew}>+ Nueva categoría</button>
      </div>

      {error && <div className="admin-error">{error}</div>}

      {form && (
        <div className="admin-card" style={{ marginBottom: 24 }}>
          <p style={{ fontFamily: "var(--font-serif)", fontSize: 16, marginBottom: 16 }}>
            {isNew ? "Nueva categoría" : `Editar: ${form.id}`}
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 80px", gap: 12 }}>
            {isNew && (
              <div className="admin-form-row">
                <label className="admin-label">ID (slug)</label>
                <input className="admin-input" value={form.id}
                  onChange={(e) => setForm({ ...form, id: e.target.value })} placeholder="comida-rapida" />
              </div>
            )}
            <div className="admin-form-row">
              <label className="admin-label">Etiqueta</label>
              <input className="admin-input" value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Comida Rápida" />
            </div>
            <div className="admin-form-row">
              <label className="admin-label">Emoji</label>
              <input className="admin-input" value={form.emoji}
                onChange={(e) => setForm({ ...form, emoji: e.target.value })} placeholder="🍔" style={{ fontSize: 20 }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="admin-btn admin-btn-primary" onClick={save} disabled={saving}>
              {saving ? "Guardando…" : "Guardar"}
            </button>
            <button className="admin-btn admin-btn-ghost" onClick={() => setForm(null)}>Cancelar</button>
          </div>
        </div>
      )}

      {loading ? <p style={{ color: "var(--ink-dim)", fontSize: 13 }}>Cargando…</p> : (
        <table className="admin-table">
          <thead><tr><th>ID</th><th>Categoría</th><th>Comercios</th><th></th></tr></thead>
          <tbody>
            {cats.map((c) => (
              <tr key={c.id}>
                <td><code style={{ fontSize: 11, color: "var(--ink-dim)" }}>{c.id}</code></td>
                <td><span style={{ marginRight: 6 }}>{c.emoji}</span>{c.label}</td>
                <td style={{ color: "var(--ink-dim)" }}>{c.merchant_count ?? "—"}</td>
                <td>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="admin-btn admin-btn-ghost" style={{ padding: "4px 10px", fontSize: 11 }} onClick={() => openEdit(c)}>Editar</button>
                    <button className="admin-btn admin-btn-danger" style={{ padding: "4px 10px", fontSize: 11 }} onClick={() => openDelete(c)}>Eliminar</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </AdminShell>
  );
}
