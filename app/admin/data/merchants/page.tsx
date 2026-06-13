"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "../../components/AdminShell";
import { DeleteModal } from "../../components/DeleteModal";

interface Merchant { id: string; name: string; category_id: string; aliases: string[]; category_label?: string; emoji?: string }
interface Category { id: string; label: string; emoji: string }

const EMPTY: Merchant = { id: "", name: "", category_id: "", aliases: [] };

export default function MerchantsPage() {
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [form,     setForm]     = useState<Merchant | null>(null);
  const [aliasInput, setAliasInput] = useState("");
  const [isNew,    setIsNew]    = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState("");
  const [delTarget, setDelTarget] = useState<Merchant | null>(null);
  const [deps,     setDeps]     = useState<{ promotions: {id:string;bank_name:string;discount:number}[] } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [search,   setSearch]   = useState("");

  async function load() {
    const [mr, cr] = await Promise.all([
      fetch("/api/admin/data/merchants"),
      fetch("/api/admin/data/categories"),
    ]);
    if (mr.ok) setMerchants(await mr.json());
    if (cr.ok) setCategories(await cr.json());
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function openNew()               { setForm({ ...EMPTY }); setAliasInput(""); setIsNew(true);  setError(""); }
  function openEdit(m: Merchant)   {
    setForm({ ...m, aliases: [...m.aliases] });
    setAliasInput(m.aliases.join(", "));
    setIsNew(false);
    setError("");
  }

  async function save() {
    if (!form) return;
    const aliases = aliasInput.split(",").map((s) => s.trim()).filter(Boolean);
    setError(""); setSaving(true);
    try {
      const method = isNew ? "POST" : "PATCH";
      const url    = isNew ? "/api/admin/data/merchants" : `/api/admin/data/merchants/${form.id}`;
      const res    = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, aliases }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Error"); return; }
      setForm(null); load();
    } catch { setError("Error de red"); } finally { setSaving(false); }
  }

  async function openDelete(m: Merchant) {
    setDelTarget(m);
    const r = await fetch(`/api/admin/data/merchants/${m.id}/deps`);
    if (r.ok) setDeps(await r.json());
  }

  async function doDelete() {
    if (!delTarget) return;
    setDeleting(true);
    const res = await fetch(`/api/admin/data/merchants/${delTarget.id}?confirmed=true`, { method: "DELETE" });
    if (res.ok) { setDelTarget(null); setDeps(null); load(); }
    else { const d = await res.json(); setError(d.error ?? "Error"); setDelTarget(null); setDeps(null); }
    setDeleting(false);
  }

  const visible = merchants.filter((m) =>
    !search || m.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <AdminShell>
      {delTarget && (
        <DeleteModal
          title={delTarget.name}
          deps={deps ? [{ label: "Promociones", items: deps.promotions.map((p) => ({ id: p.id, name: `${p.bank_name} — ${p.discount}%` })) }] : undefined}
          onConfirm={doDelete}
          onCancel={() => { setDelTarget(null); setDeps(null); }}
          loading={deleting}
        />
      )}

      <div className="admin-header">
        <h1 className="admin-title">Comercios</h1>
        <button className="admin-btn admin-btn-primary" onClick={openNew}>+ Nuevo comercio</button>
      </div>

      {error && <div className="admin-error">{error}</div>}

      {form && (
        <div className="admin-card" style={{ marginBottom: 24 }}>
          <p style={{ fontFamily: "var(--font-serif)", fontSize: 16, marginBottom: 16 }}>
            {isNew ? "Nuevo comercio" : `Editar: ${form.id}`}
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {isNew && (
              <div className="admin-form-row">
                <label className="admin-label">ID (slug)</label>
                <input className="admin-input" value={form.id}
                  onChange={(e) => setForm({ ...form, id: e.target.value })} placeholder="papa-johns" />
              </div>
            )}
            <div className="admin-form-row">
              <label className="admin-label">Nombre</label>
              <input className="admin-input" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="admin-form-row">
              <label className="admin-label">Categoría</label>
              <select className="admin-input" value={form.category_id}
                onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
                <option value="">— Seleccionar —</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
              </select>
            </div>
            <div className="admin-form-row" style={{ gridColumn: "1 / -1" }}>
              <label className="admin-label">Aliases (separados por coma)</label>
              <input className="admin-input" value={aliasInput}
                onChange={(e) => setAliasInput(e.target.value)}
                placeholder="papa jones, papajohns" />
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

      <div style={{ marginBottom: 16 }}>
        <input className="admin-input" value={search} onChange={(e) => setSearch(e.target.value)}
               placeholder="Buscar comercio…" style={{ maxWidth: 280 }} />
      </div>

      {loading ? <p style={{ color: "var(--ink-dim)", fontSize: 13 }}>Cargando…</p> : (
        <table className="admin-table">
          <thead><tr><th>ID</th><th>Nombre</th><th>Categoría</th><th>Aliases</th><th></th></tr></thead>
          <tbody>
            {visible.map((m) => (
              <tr key={m.id}>
                <td><code style={{ fontSize: 11, color: "var(--ink-dim)" }}>{m.id}</code></td>
                <td>{m.name}</td>
                <td>{m.emoji} {m.category_label ?? m.category_id}</td>
                <td style={{ fontSize: 11, color: "var(--ink-dim)" }}>{m.aliases.join(", ") || "—"}</td>
                <td>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="admin-btn admin-btn-ghost" style={{ padding: "4px 10px", fontSize: 11 }} onClick={() => openEdit(m)}>Editar</button>
                    <button className="admin-btn admin-btn-danger" style={{ padding: "4px 10px", fontSize: 11 }} onClick={() => openDelete(m)}>Eliminar</button>
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
