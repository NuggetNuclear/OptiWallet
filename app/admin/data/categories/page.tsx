"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "../../components/AdminShell";
import { DeleteModal } from "../../components/DeleteModal";
import { MergeModal } from "../../components/MergeModal";
import { AdminFloatingAction } from "../../components/AdminFloatingAction";

interface Category { id: string; label: string; emoji: string; merchant_count?: number }

const EMPTY: Category = { id: "", label: "", emoji: "" };

export default function CategoriesPage() {
  const [cats,    setCats]    = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [form,    setForm]    = useState<Category | null>(null);
  const [origId,  setOrigId]  = useState("");
  const [isNew,   setIsNew]   = useState(false);
  const [cascade, setCascade] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState("");
  const [success, setSuccess] = useState("");
  const [delTarget, setDelTarget] = useState<Category | null>(null);
  const [deps,    setDeps]    = useState<{ merchants: {id:string;name:string}[] } | null>(null);
  const [deleting,  setDeleting]  = useState(false);
  const [mergeSrc, setMergeSrc] = useState<Category | null>(null);
  const [merging,  setMerging]  = useState(false);

  async function load() {
    const r = await fetch("/api/admin/data/categories");
    if (r.ok) setCats(await r.json());
    setLoading(false);
  }
  useEffect(() => { (async () => { await load(); })(); }, []);

  function openNew()             { setForm({ ...EMPTY }); setOrigId(""); setIsNew(true);  setCascade(true); setError(""); setSuccess(""); }
  function openEdit(c: Category) { setForm({ ...c });    setOrigId(c.id); setIsNew(false); setCascade(true); setError(""); setSuccess(""); }

  async function save() {
    if (!form) return;
    setError(""); setSuccess(""); setSaving(true);
    try {
      const method = isNew ? "POST" : "PATCH";
      const url    = isNew ? "/api/admin/data/categories" : `/api/admin/data/categories/${origId}`;
      const payload = isNew
        ? form
        : { label: form.label, emoji: form.emoji, ...(form.id !== origId ? { new_id: form.id, cascade } : {}) };
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Error"); return; }
      const renamed = !isNew && form.id !== origId;
      setSuccess(
        isNew ? "Categoría creada" :
        renamed ? `ID renombrada${data.merchants_updated ? ` · ${data.merchants_updated} comercio(s) actualizados` : ""}` :
        "Cambios guardados"
      );
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
    if (res.ok) { setSuccess("Categoría eliminada"); setDelTarget(null); setDeps(null); load(); }
    else { const d = await res.json(); setError(d.error ?? "Error"); setDelTarget(null); setDeps(null); }
    setDeleting(false);
  }

  async function doMerge(targetId: string) {
    if (!mergeSrc) return;
    setError(""); setSuccess(""); setMerging(true);
    try {
      const res = await fetch(`/api/admin/data/categories/${mergeSrc.id}/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_id: targetId }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Error"); return; }
      setSuccess(`Categorías fusionadas${data.merchants_moved ? ` · ${data.merchants_moved} comercio(s) movidos` : ""}`);
      setMergeSrc(null); load();
    } catch { setError("Error de red"); } finally { setMerging(false); }
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

      {mergeSrc && (
        <MergeModal
          source={mergeSrc}
          noun="categoría"
          merchantCount={mergeSrc.merchant_count}
          options={cats.filter((c) => c.id !== mergeSrc.id)}
          onConfirm={doMerge}
          onCancel={() => setMergeSrc(null)}
          loading={merging}
        />
      )}

      <div className="admin-header">
        <h1 className="admin-title">Categorías</h1>
        <AdminFloatingAction>
          <button className="admin-btn admin-btn-primary" onClick={openNew}>+ Nueva categoría</button>
        </AdminFloatingAction>
      </div>

      {error && <div className="admin-error">{error}</div>}
      {success && <div className="admin-success">{success}</div>}

      {form && (
        <div className="admin-card" style={{ marginBottom: 24 }}>
          <p className="admin-card-title">{isNew ? "Nueva categoría" : `Editar: ${form.id}`}</p>
          <div className="admin-form-grid">
            <div className="admin-form-row">
              <label className="admin-label">ID (slug){!isNew && origId !== form.id && <span style={{ color: "var(--lime)", fontFamily: "var(--font-jetbrains)", fontSize: 10, marginLeft: 6 }}>← cambiado</span>}</label>
              <input className="admin-input" value={form.id}
                onChange={(e) => setForm({ ...form, id: e.target.value })} placeholder="comida-rapida" />
            </div>
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
          {!isNew && form.id !== origId && (
            <label className="admin-check-row" style={{ marginBottom: 16 }}>
              <input type="checkbox" checked={cascade} onChange={(e) => setCascade(e.target.checked)} />
              Propagar cambio de ID en cascade
              <span style={{ fontSize: 11, color: "var(--ink-dim)", fontFamily: "var(--font-jetbrains)" }}>
                {" "}(actualiza category_id en todos los comercios vinculados)
              </span>
            </label>
          )}
          <div className="admin-form-actions">
            <button className="admin-btn admin-btn-primary" onClick={save} disabled={saving}>
              {saving ? "Guardando…" : "Guardar"}
            </button>
            <button className="admin-btn admin-btn-ghost" onClick={() => setForm(null)}>Cancelar</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="admin-loading"><span className="admin-spinner" aria-hidden="true" />Cargando…</div>
      ) : cats.length === 0 ? (
        <div className="admin-empty">
          <div className="admin-empty-text">No hay categorías todavía. Crea la primera con &quot;+ Nueva categoría&quot;.</div>
        </div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>ID</th><th>Categoría</th><th>Comercios</th><th></th></tr></thead>
            <tbody>
              {cats.map((c) => (
                <tr key={c.id}>
                  <td><code className="admin-code">{c.id}</code></td>
                  <td><span style={{ marginRight: 6 }}>{c.emoji}</span>{c.label}</td>
                  <td className="admin-cell-dim">{c.merchant_count ?? "—"}</td>
                  <td>
                    <div className="admin-actions">
                      <button className="admin-btn admin-btn-ghost admin-btn-sm" onClick={() => openEdit(c)}>Editar</button>
                      <button className="admin-btn admin-btn-ghost admin-btn-sm" onClick={() => { setError(""); setSuccess(""); setMergeSrc(c); }} disabled={cats.length < 2}>Fusionar</button>
                      <button className="admin-btn admin-btn-danger admin-btn-sm" onClick={() => openDelete(c)}>Eliminar</button>
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
