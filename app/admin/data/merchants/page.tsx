"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "../../components/AdminShell";
import { DeleteModal } from "../../components/DeleteModal";
import { AdminFloatingAction } from "../../components/AdminFloatingAction";

interface MerchantTag { id: string; label: string; emoji: string | null }
interface Merchant { id: string; name: string; category_id: string; aliases: string[]; category_label?: string; emoji?: string; tags?: MerchantTag[] }
interface Category { id: string; label: string; emoji: string }
interface Tag { id: string; label: string; emoji: string | null }

const EMPTY: Merchant = { id: "", name: "", category_id: "", aliases: [], tags: [] };

export default function MerchantsPage() {
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags,     setTags]     = useState<Tag[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [form,     setForm]     = useState<Merchant | null>(null);
  const [aliasInput, setAliasInput] = useState("");
  const [selTags,  setSelTags]  = useState<string[]>([]);
  const [isNew,    setIsNew]    = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState("");
  const [success,  setSuccess]  = useState("");
  const [delTarget, setDelTarget] = useState<Merchant | null>(null);
  const [deps,     setDeps]     = useState<{ promotions: {id:string;bank_name:string;discount:number}[] } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [search,   setSearch]   = useState("");

  async function load() {
    const [mr, cr, tr] = await Promise.all([
      fetch("/api/admin/data/merchants"),
      fetch("/api/admin/data/categories"),
      fetch("/api/admin/data/tags"),
    ]);
    if (mr.ok) setMerchants(await mr.json());
    if (cr.ok) setCategories(await cr.json());
    if (tr.ok) setTags(await tr.json());
    setLoading(false);
  }
  useEffect(() => { (async () => { await load(); })(); }, []);

  function openNew()               { setForm({ ...EMPTY }); setAliasInput(""); setSelTags([]); setIsNew(true);  setError(""); setSuccess(""); }
  function openEdit(m: Merchant)   {
    setForm({ ...m, aliases: [...m.aliases] });
    setAliasInput(m.aliases.join(", "));
    setSelTags((m.tags ?? []).map((t) => t.id));
    setIsNew(false);
    setError(""); setSuccess("");
  }

  function toggleTag(id: string) {
    setSelTags((prev) => prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]);
  }

  async function save() {
    if (!form) return;
    const aliases = aliasInput.split(",").map((s) => s.trim()).filter(Boolean);
    setError(""); setSuccess(""); setSaving(true);
    try {
      const method = isNew ? "POST" : "PATCH";
      const url    = isNew ? "/api/admin/data/merchants" : `/api/admin/data/merchants/${form.id}`;
      const res    = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, aliases, tag_ids: selTags }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Error"); return; }
      setSuccess(isNew ? "Comercio creado" : "Cambios guardados");
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
    if (res.ok) { setSuccess("Comercio eliminado"); setDelTarget(null); setDeps(null); load(); }
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
        <AdminFloatingAction>
          <button className="admin-btn admin-btn-primary" onClick={openNew}>+ Nuevo comercio</button>
        </AdminFloatingAction>
      </div>

      {error && <div className="admin-error">{error}</div>}
      {success && <div className="admin-success">{success}</div>}

      {form && (
        <div className="admin-modal-overlay" onClick={() => !saving && setForm(null)}>
          <div className="admin-modal" style={{ width: 580 }} onClick={(e) => e.stopPropagation()}>
            <h2 className="admin-modal-title">{isNew ? "Nuevo comercio" : `Editar: ${form.id}`}</h2>
            <div className="admin-form-grid">
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
              <div className="admin-form-row span-2">
                <label className="admin-label">Aliases (separados por coma)</label>
                <input className="admin-input" value={aliasInput}
                  onChange={(e) => setAliasInput(e.target.value)}
                  placeholder="papa jones, papajohns" />
              </div>
              <div className="admin-form-row span-2">
                <label className="admin-label">Etiquetas {selTags.length > 0 && <span style={{ color: "var(--ink-dim)", fontSize: 11 }}>({selTags.length})</span>}</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {tags.length === 0 && <span style={{ fontSize: 12, color: "var(--ink-dim)" }}>No hay etiquetas. Créalas en Etiquetas.</span>}
                  {tags.map((t) => {
                    const on = selTags.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => toggleTag(t.id)}
                        className={`admin-btn admin-btn-sm ${on ? "admin-btn-primary" : "admin-btn-ghost"}`}
                      >
                        {t.emoji ? `${t.emoji} ` : ""}{t.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="admin-form-actions" style={{ marginTop: 20 }}>
              <button className="admin-btn admin-btn-primary" onClick={save} disabled={saving}>
                {saving ? "Guardando…" : "Guardar"}
              </button>
              <button className="admin-btn admin-btn-ghost" onClick={() => setForm(null)} disabled={saving}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      <div className="admin-toolbar">
        <input className="admin-input" value={search} onChange={(e) => setSearch(e.target.value)}
               placeholder="Buscar comercio…" style={{ maxWidth: 280 }} />
      </div>

      {loading ? (
        <div className="admin-loading"><span className="admin-spinner" aria-hidden="true" />Cargando…</div>
      ) : visible.length === 0 ? (
        <div className="admin-empty">
          <div className="admin-empty-text">
            {search ? "Ningún comercio coincide con la búsqueda." : 'No hay comercios todavía. Crea el primero con "+ Nuevo comercio".'}
          </div>
        </div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>ID</th><th>Nombre</th><th>Categoría</th><th>Etiquetas</th><th>Aliases</th><th></th></tr></thead>
            <tbody>
              {visible.map((m) => (
                <tr key={m.id}>
                  <td><code className="admin-code">{m.id}</code></td>
                  <td>{m.name}</td>
                  <td>{m.emoji} {m.category_label ?? m.category_id}</td>
                  <td className="admin-cell-dim" style={{ fontSize: 11 }}>
                    {m.tags && m.tags.length ? m.tags.map((t) => t.label).join(", ") : "—"}
                  </td>
                  <td className="admin-cell-dim" style={{ fontSize: 11 }}>{m.aliases.join(", ") || "—"}</td>
                  <td>
                    <div className="admin-actions">
                      <button className="admin-btn admin-btn-ghost admin-btn-sm" onClick={() => openEdit(m)}>Editar</button>
                      <button className="admin-btn admin-btn-danger admin-btn-sm" onClick={() => openDelete(m)}>Eliminar</button>
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
