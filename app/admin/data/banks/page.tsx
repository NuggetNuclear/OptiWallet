"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AdminShell } from "../../components/AdminShell";
import { DeleteModal } from "../../components/DeleteModal";
import { AdminFloatingAction } from "../../components/AdminFloatingAction";

interface Bank { id: string; name: string; short_name: string | null; available: boolean; color: string | null }

const EMPTY: Bank = { id: "", name: "", short_name: "", available: false, color: null };

export default function BanksPage() {
  const [banks,      setBanks]      = useState<Bank[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [form,       setForm]       = useState<Bank | null>(null);
  const [isNew,      setIsNew]      = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState("");
  const [success,    setSuccess]    = useState("");
  const [delTarget,  setDelTarget]  = useState<Bank | null>(null);
  const [deps,       setDeps]       = useState<{ cards: {id:string;name:string}[]; promotions: {id:string}[] } | null>(null);
  const [deleting,   setDeleting]   = useState(false);
  const [toggleTarget, setToggleTarget] = useState<Bank | null>(null);
  const [toggling,   setToggling]   = useState(false);
  const [checkingDeps, setCheckingDeps] = useState(false);

  async function load() {
    try {
      const r = await fetch("/api/admin/data/banks");
      if (r.ok) setBanks(await r.json());
    } catch (err) {
      console.error("Error fetching banks:", err);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { (async () => { await load(); })(); }, []);

  function openNew() { setForm({ ...EMPTY }); setIsNew(true); setError(""); setSuccess(""); }
  function openEdit(b: Bank) {
    setForm({ ...b, color: b.color ? b.color.replace("#", "") : null });
    setIsNew(false);
    setError("");
    setSuccess("");
  }
  function cancelForm() { setForm(null); }

  async function save() {
    if (!form) return;
    setError(""); setSuccess(""); setSaving(true);
    try {
      const method = isNew ? "POST" : "PATCH";
      const url    = isNew ? "/api/admin/data/banks" : `/api/admin/data/banks/${form.id}`;
      const colorFormatted = form.color ? `#${form.color.replace("#", "")}` : null;
      const res    = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, color: colorFormatted }),
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
    try {
      const r = await fetch(`/api/admin/data/banks/${b.id}/deps`);
      if (r.ok) setDeps(await r.json());
    } catch (err) {
      console.error("Error fetching bank dependencies:", err);
    }
  }

  async function doDelete() {
    if (!delTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/data/banks/${delTarget.id}?confirmed=true`, { method: "DELETE" });
      if (res.ok) { setSuccess("Banco eliminado"); setDelTarget(null); setDeps(null); load(); }
      else { const d = await res.json(); setError(d.error ?? "Error"); setDelTarget(null); setDeps(null); }
    } catch {
      setError("Error de red"); setDelTarget(null); setDeps(null);
    } finally {
      setDeleting(false);
    }
  }

  async function openToggle(b: Bank) {
    setToggleTarget(b);
    if (!b.available) {
      setCheckingDeps(true);
      setDeps(null);
      try {
        const r = await fetch(`/api/admin/data/banks/${b.id}/deps`);
        if (r.ok) {
          const data = await r.json();
          setDeps(data);
        }
      } catch (err) {
        console.error("Error fetching bank dependencies:", err);
      } finally {
        setCheckingDeps(false);
      }
    } else {
      setDeps(null);
    }
  }

  async function confirmToggle() {
    if (!toggleTarget) return;
    setToggling(true);
    try {
      const res = await fetch(`/api/admin/data/banks/${toggleTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ available: !toggleTarget.available }),
      });
      if (res.ok) {
        setSuccess(`Banco ${toggleTarget.available ? "desactivado" : "activado"}`);
        load();
      } else {
        const d = await res.json();
        setError(d.error ?? "Error");
      }
    } catch { setError("Error de red"); } finally {
      setToggling(false);
      setToggleTarget(null);
      setDeps(null);
    }
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

      {toggleTarget && (
        <div className="admin-modal-overlay" onClick={() => !toggling && !checkingDeps && (setToggleTarget(null), setDeps(null))}>
          <div className="admin-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <p className="admin-modal-title">
              {toggleTarget.available ? "Desactivar banco" : "Activar banco"}
            </p>
            {checkingDeps ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "20px 0" }}>
                <span className="admin-spinner" aria-hidden="true" />
                <span style={{ fontSize: 13, color: "var(--ink-dim)" }}>Comprobando tarjetas asociadas…</span>
              </div>
            ) : !toggleTarget.available && deps && deps.cards.length === 0 ? (
              <>
                <div className="admin-error" style={{ marginBottom: 24 }}>
                  No puedes activar este banco porque no tiene tarjetas asociadas. Agrega al menos una tarjeta primero antes de activarlo.
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <Link href="/admin/data/cards" className="admin-btn admin-btn-primary">
                    Ir a Tarjetas
                  </Link>
                  <button
                    className="admin-btn admin-btn-ghost"
                    onClick={() => { setToggleTarget(null); setDeps(null); }}
                  >
                    Cerrar
                  </button>
                </div>
              </>
            ) : (
              <>
                <p style={{ fontSize: 13, color: "var(--ink-dim)", marginBottom: 24 }}>
                  {toggleTarget.available
                    ? `"${toggleTarget.name}" quedará oculto en la aplicación y sus promociones dejarán de mostrarse.`
                    : `"${toggleTarget.name}" volverá a ser visible en la aplicación.`}
                </p>
                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    className={`admin-btn ${toggleTarget.available ? "admin-btn-danger" : "admin-btn-primary"}`}
                    onClick={confirmToggle}
                    disabled={toggling}
                  >
                    {toggling ? "Guardando…" : toggleTarget.available ? "Desactivar" : "Activar"}
                  </button>
                  <button
                    className="admin-btn admin-btn-ghost"
                    onClick={() => { setToggleTarget(null); setDeps(null); }}
                    disabled={toggling}
                  >
                    Cancelar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <div className="admin-header">
        <h1 className="admin-title">Bancos</h1>
        <AdminFloatingAction>
          <button className="admin-btn admin-btn-primary" onClick={openNew}>+ Nuevo banco</button>
        </AdminFloatingAction>
      </div>

      {error && <div className="admin-error">{error}</div>}
      {success && <div className="admin-success">{success}</div>}

      {form && (
        <div className="admin-modal-overlay" onClick={() => !saving && cancelForm()}>
          <div className="admin-modal" style={{ width: 520 }} onClick={(e) => e.stopPropagation()}>
            <h2 className="admin-modal-title">{isNew ? "Nuevo banco" : `Editar: ${form.id}`}</h2>
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
              <div className="admin-form-row">
                <label className="admin-label">Color de marca (código HEX)</label>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <input
                    type="color"
                    className="admin-input"
                    style={{ width: 44, height: 38, padding: 2, cursor: "pointer", border: "1px solid var(--line)" }}
                    value={form.color ? `#${form.color.replace("#", "")}` : "#0b0d0c"}
                    onChange={(e) => setForm({ ...form, color: e.target.value.replace("#", "") })}
                  />
                  <input
                    type="text"
                    className="admin-input"
                    style={{ flex: 1, textTransform: "uppercase" }}
                    placeholder="HEX (ej: FF0000 o #FF0000)"
                    value={form.color ?? ""}
                    onChange={(e) => {
                      const val = e.target.value.replace(/#/g, "");
                      setForm({ ...form, color: val || null });
                    }}
                  />
                  {form.color && (
                    <button
                      type="button"
                      className="admin-btn admin-btn-ghost admin-btn-sm"
                      onClick={() => setForm({ ...form, color: null })}
                    >
                      Limpiar
                    </button>
                  )}
                </div>
              </div>
            </div>
            <label className="admin-check-row" style={{ marginBottom: 16, marginTop: 16 }}>
              <input type="checkbox" checked={form.available}
                onChange={(e) => setForm({ ...form, available: e.target.checked })} />
              Disponible (muestra en la app)
            </label>
            <div className="admin-form-actions" style={{ marginTop: 20 }}>
              <button className="admin-btn admin-btn-primary" onClick={save} disabled={saving}>
                {saving ? "Guardando…" : "Guardar"}
              </button>
              <button className="admin-btn admin-btn-ghost" onClick={cancelForm} disabled={saving}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="admin-loading"><span className="admin-spinner" aria-hidden="true" />Cargando…</div>
      ) : banks.length === 0 ? (
        <div className="admin-empty">
          <div className="admin-empty-text">No hay bancos todavía. Crea el primero con &quot;+ Nuevo banco&quot;.</div>
        </div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th>ID</th><th>Color</th><th>Nombre</th><th>Short name</th><th>Disponible</th><th></th></tr>
            </thead>
            <tbody>
              {banks.map((b) => (
                <tr key={b.id}>
                  <td><code className="admin-code">{b.id}</code></td>
                  <td>
                    {b.color ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span
                          style={{
                            display: "inline-block",
                            width: 16,
                            height: 16,
                            borderRadius: 4,
                            backgroundColor: b.color,
                            border: "1px solid var(--line-strong)",
                          }}
                        />
                        <code style={{ fontSize: 10, fontFamily: "var(--font-jetbrains)" }}>{b.color}</code>
                      </div>
                    ) : (
                      <span className="admin-cell-dim">—</span>
                    )}
                  </td>
                  <td>{b.name}</td>
                  <td className="admin-cell-dim">{b.short_name ?? "—"}</td>
                  <td>
                    <button
                      className="admin-toggle"
                      role="switch"
                      aria-checked={b.available}
                      aria-label={b.available ? "Desactivar banco" : "Activar banco"}
                      onClick={() => openToggle(b)}
                    >
                      <span className="admin-toggle-track">
                        <span className="admin-toggle-thumb" />
                      </span>
                      <span className="admin-toggle-label">
                        {b.available ? "Activo" : "Inactivo"}
                      </span>
                    </button>
                  </td>
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
