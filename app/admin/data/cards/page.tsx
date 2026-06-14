"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "../../components/AdminShell";
import { DeleteModal } from "../../components/DeleteModal";

interface Card  { id: string; bank_id: string; name: string; type: "credit" | "debit" }
interface Bank  { id: string; name: string }

const EMPTY: Card = { id: "", bank_id: "", name: "", type: "credit" };

export default function CardsPage() {
  const [cards,   setCards]   = useState<Card[]>([]);
  const [banks,   setBanks]   = useState<Bank[]>([]);
  const [loading, setLoading] = useState(true);
  const [form,    setForm]    = useState<Card | null>(null);
  const [isNew,   setIsNew]   = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState("");
  const [success, setSuccess] = useState("");
  const [delTarget, setDelTarget] = useState<Card | null>(null);
  const [deleting,  setDeleting]  = useState(false);

  async function load() {
    const [cr, br] = await Promise.all([
      fetch("/api/admin/data/cards"),
      fetch("/api/admin/data/banks"),
    ]);
    if (cr.ok) setCards(await cr.json());
    if (br.ok) setBanks(await br.json());
    setLoading(false);
  }
  useEffect(() => { (async () => { await load(); })(); }, []);

  function openNew()        { setForm({ ...EMPTY }); setIsNew(true);  setError(""); setSuccess(""); }
  function openEdit(c: Card){ setForm({ ...c });     setIsNew(false); setError(""); setSuccess(""); }

  async function save() {
    if (!form) return;
    setError(""); setSuccess(""); setSaving(true);
    try {
      const method = isNew ? "POST" : "PATCH";
      const url    = isNew ? "/api/admin/data/cards" : `/api/admin/data/cards/${form.id}`;
      const res    = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Error"); return; }
      setSuccess(isNew ? "Tarjeta creada" : "Cambios guardados");
      setForm(null); load();
    } catch { setError("Error de red"); } finally { setSaving(false); }
  }

  async function doDelete() {
    if (!delTarget) return;
    setDeleting(true);
    const res = await fetch(`/api/admin/data/cards/${delTarget.id}`, { method: "DELETE" });
    if (res.ok) { setSuccess("Tarjeta eliminada"); setDelTarget(null); load(); }
    else { const d = await res.json(); setError(d.error ?? "Error"); setDelTarget(null); }
    setDeleting(false);
  }

  const bankName = (id: string) => banks.find((b) => b.id === id)?.name ?? id;

  return (
    <AdminShell>
      {delTarget && (
        <DeleteModal title={delTarget.name} onConfirm={doDelete}
                     onCancel={() => setDelTarget(null)} loading={deleting} />
      )}

      <div className="admin-header">
        <h1 className="admin-title">Tarjetas</h1>
        <button className="admin-btn admin-btn-primary" onClick={openNew}>+ Nueva tarjeta</button>
      </div>

      {error && <div className="admin-error">{error}</div>}
      {success && <div className="admin-success">{success}</div>}

      {form && (
        <div className="admin-card" style={{ marginBottom: 24 }}>
          <p className="admin-card-title">{isNew ? "Nueva tarjeta" : `Editar: ${form.id}`}</p>
          <div className="admin-form-grid">
            {isNew && (
              <div className="admin-form-row">
                <label className="admin-label">ID (slug)</label>
                <input className="admin-input" value={form.id}
                  onChange={(e) => setForm({ ...form, id: e.target.value })} placeholder="bci-credit" />
              </div>
            )}
            <div className="admin-form-row">
              <label className="admin-label">Nombre</label>
              <input className="admin-input" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="admin-form-row">
              <label className="admin-label">Banco</label>
              <select className="admin-input" value={form.bank_id}
                onChange={(e) => setForm({ ...form, bank_id: e.target.value })}>
                <option value="">— Seleccionar —</option>
                {banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div className="admin-form-row">
              <label className="admin-label">Tipo</label>
              <select className="admin-input" value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as "credit" | "debit" })}>
                <option value="credit">Crédito</option>
                <option value="debit">Débito</option>
              </select>
            </div>
          </div>
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
      ) : cards.length === 0 ? (
        <div className="admin-empty">
          <div className="admin-empty-text">No hay tarjetas todavía. Crea la primera con "+ Nueva tarjeta".</div>
        </div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>ID</th><th>Nombre</th><th>Banco</th><th>Tipo</th><th></th></tr></thead>
            <tbody>
              {cards.map((c) => (
                <tr key={c.id}>
                  <td><code className="admin-code">{c.id}</code></td>
                  <td>{c.name}</td>
                  <td>{bankName(c.bank_id)}</td>
                  <td><span className={`admin-badge ${c.type === "credit" ? "admin-badge-green" : "admin-badge-dim"}`}>{c.type}</span></td>
                  <td>
                    <div className="admin-actions">
                      <button className="admin-btn admin-btn-ghost admin-btn-sm" onClick={() => openEdit(c)}>Editar</button>
                      <button className="admin-btn admin-btn-danger admin-btn-sm" onClick={() => setDelTarget(c)}>Eliminar</button>
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
