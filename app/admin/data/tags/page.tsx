"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "../../components/AdminShell";
import { DeleteModal } from "../../components/DeleteModal";
import { MergeModal } from "../../components/MergeModal";
import { AdminFloatingAction } from "../../components/AdminFloatingAction";

interface Tag { id: string; label: string; emoji: string | null; merchant_count?: number }

const EMPTY: Tag = { id: "", label: "", emoji: "" };

export default function TagsPage() {
  const [tags,    setTags]    = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [form,    setForm]    = useState<Tag | null>(null);
  const [origId,  setOrigId]  = useState("");
  const [isNew,   setIsNew]   = useState(false);
  const [cascade, setCascade] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState("");
  const [success, setSuccess] = useState("");
  const [delTarget, setDelTarget] = useState<Tag | null>(null);
  const [deps,    setDeps]    = useState<{ merchants: {id:string;name:string}[] } | null>(null);
  const [deleting,  setDeleting]  = useState(false);
  const [mergeSrc, setMergeSrc] = useState<Tag | null>(null);
  const [merging,  setMerging]  = useState(false);

  async function load() {
    const r = await fetch("/api/admin/data/tags");
    if (r.ok) setTags(await r.json());
    setLoading(false);
  }
  useEffect(() => { (async () => { await load(); })(); }, []);

  function openNew()        { setForm({ ...EMPTY }); setOrigId(""); setIsNew(true);  setCascade(true); setError(""); setSuccess(""); }
  function openEdit(t: Tag) { setForm({ ...t });    setOrigId(t.id); setIsNew(false); setCascade(true); setError(""); setSuccess(""); }

  async function save() {
    if (!form) return;
    setError(""); setSuccess(""); setSaving(true);
    try {
      const method = isNew ? "POST" : "PATCH";
      const url    = isNew ? "/api/admin/data/tags" : `/api/admin/data/tags/${origId}`;
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
        isNew ? "Tag creado" :
        renamed ? `ID renombrada${data.merchants_updated ? ` · ${data.merchants_updated} comercio(s) actualizados` : ""}` :
        "Cambios guardados"
      );
      setForm(null); load();
    } catch { setError("Error de red"); } finally { setSaving(false); }
  }

  async function openDelete(t: Tag) {
    setDelTarget(t);
    const r = await fetch(`/api/admin/data/tags/${t.id}/deps`);
    if (r.ok) setDeps(await r.json());
  }

  async function doDelete() {
    if (!delTarget) return;
    setDeleting(true);
    const res = await fetch(`/api/admin/data/tags/${delTarget.id}?confirmed=true`, { method: "DELETE" });
    if (res.ok) { setSuccess("Tag eliminado"); setDelTarget(null); setDeps(null); load(); }
    else { const d = await res.json(); setError(d.error ?? "Error"); setDelTarget(null); setDeps(null); }
    setDeleting(false);
  }

  async function doMerge(targetId: string) {
    if (!mergeSrc) return;
    setError(""); setSuccess(""); setMerging(true);
    try {
      const res = await fetch(`/api/admin/data/tags/${mergeSrc.id}/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_id: targetId }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Error"); return; }
      setSuccess(`Tags fusionados${data.merchants_moved ? ` · ${data.merchants_moved} comercio(s) reasignados` : ""}`);
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
          noun="tag"
          merchantCount={mergeSrc.merchant_count}
          options={tags.filter((t) => t.id !== mergeSrc.id)}
          onConfirm={doMerge}
          onCancel={() => setMergeSrc(null)}
          loading={merging}
        />
      )}

      <div className="admin-header">
        <h1 className="admin-title">Etiquetas</h1>
        <AdminFloatingAction>
          <button className="admin-btn admin-btn-primary" onClick={openNew}>+ Nueva etiqueta</button>
        </AdminFloatingAction>
      </div>

      <p style={{ fontSize: 13, color: "var(--ink-dim)", marginBottom: 16 }}>
        Los tags son atributos transversales (Sushi, Delivery, Pet-Friendly…). Un comercio puede tener varios;
        se usan para filtrar dentro de las categorías macro.
      </p>

      {error && <div className="admin-error">{error}</div>}
      {success && <div className="admin-success">{success}</div>}

      {form && (
        <div className="admin-modal-overlay" onClick={() => !saving && setForm(null)}>
          <div className="admin-modal" style={{ width: 520 }} onClick={(e) => e.stopPropagation()}>
            <h2 className="admin-modal-title">{isNew ? "Nueva etiqueta" : `Editar: ${form.id}`}</h2>
            <div className="admin-form-grid">
              <div className="admin-form-row">
                <label className="admin-label">ID (slug){!isNew && origId !== form.id && <span style={{ color: "var(--lime)", fontFamily: "var(--font-jetbrains)", fontSize: 10, marginLeft: 6 }}>← cambiado</span>}</label>
                <input className="admin-input" value={form.id}
                  onChange={(e) => setForm({ ...form, id: e.target.value })} placeholder="sushi" />
              </div>
              <div className="admin-form-row">
                <label className="admin-label">Etiqueta</label>
                <input className="admin-input" value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Sushi" />
              </div>
              <div className="admin-form-row">
                <label className="admin-label">Emoji <span style={{ fontSize: 11, color: "var(--ink-dim)" }}>(opcional)</span></label>
                <input className="admin-input" value={form.emoji ?? ""}
                  onChange={(e) => setForm({ ...form, emoji: e.target.value })} placeholder="🍣" style={{ fontSize: 20 }} />
              </div>
            </div>
            {!isNew && form.id !== origId && (
              <label className="admin-check-row" style={{ marginBottom: 16, marginTop: 16 }}>
                <input type="checkbox" checked={cascade} onChange={(e) => setCascade(e.target.checked)} />
                Propagar cambio de ID en cascade
                <span style={{ fontSize: 11, color: "var(--ink-dim)", fontFamily: "var(--font-jetbrains)" }}>
                  {" "}(reasigna el tag en todos los comercios vinculados)
                </span>
              </label>
            )}
            <div className="admin-form-actions" style={{ marginTop: 20 }}>
              <button className="admin-btn admin-btn-primary" onClick={save} disabled={saving}>
                {saving ? "Guardando…" : "Guardar"}
              </button>
              <button className="admin-btn admin-btn-ghost" onClick={() => setForm(null)} disabled={saving}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="admin-loading"><span className="admin-spinner" aria-hidden="true" />Cargando…</div>
      ) : tags.length === 0 ? (
        <div className="admin-empty">
          <div className="admin-empty-text">No hay etiquetas todavía. Crea la primera con &quot;+ Nueva etiqueta&quot;.</div>
        </div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>ID</th><th>Etiqueta</th><th>Comercios</th><th></th></tr></thead>
            <tbody>
              {tags.map((t) => (
                <tr key={t.id}>
                  <td><code className="admin-code">{t.id}</code></td>
                  <td><span style={{ marginRight: 6 }}>{t.emoji}</span>{t.label}</td>
                  <td className="admin-cell-dim">{t.merchant_count ?? "—"}</td>
                  <td>
                    <div className="admin-actions">
                      <button className="admin-btn admin-btn-ghost admin-btn-sm" onClick={() => openEdit(t)}>Editar</button>
                      <button className="admin-btn admin-btn-ghost admin-btn-sm" onClick={() => { setError(""); setSuccess(""); setMergeSrc(t); }} disabled={tags.length < 2}>Fusionar</button>
                      <button className="admin-btn admin-btn-danger admin-btn-sm" onClick={() => openDelete(t)}>Eliminar</button>
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
