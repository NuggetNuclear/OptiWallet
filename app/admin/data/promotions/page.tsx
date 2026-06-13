"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "../../components/AdminShell";
import { DeleteModal } from "../../components/DeleteModal";

interface Promo {
  id: string; bank_id: string; card_types: string[]; merchant_id: string;
  discount: number; cap: number | null; min_purchase: number | null;
  days_of_week: number[]; start_date: string | null; end_date: string | null;
  modality: string; code: string | null; conditions: string | null;
  source: string; verified_at: string; active: boolean;
  bank_name?: string; merchant_name?: string;
}
interface Bank     { id: string; name: string }
interface Merchant { id: string; name: string }

const DAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

const EMPTY: Promo = {
  id: "", bank_id: "", card_types: ["credit"], merchant_id: "",
  discount: 10, cap: null, min_purchase: null,
  days_of_week: [], start_date: null, end_date: null,
  modality: "both", code: null, conditions: null,
  source: "", verified_at: new Date().toISOString().slice(0, 10), active: true,
};

export default function PromotionsPage() {
  const [promos,    setPromos]    = useState<Promo[]>([]);
  const [banks,     setBanks]     = useState<Bank[]>([]);
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [form,      setForm]      = useState<Promo | null>(null);
  const [isNew,     setIsNew]     = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState("");
  const [delTarget, setDelTarget] = useState<Promo | null>(null);
  const [deleting,  setDeleting]  = useState(false);
  const [filterBank, setFilterBank]  = useState("");
  const [showActive, setShowActive]  = useState(false);

  async function load() {
    const params = new URLSearchParams();
    if (filterBank) params.set("bankId", filterBank);
    if (showActive) params.set("active", "true");
    const [pr, br, mr] = await Promise.all([
      fetch(`/api/admin/data/promotions?${params}`),
      fetch("/api/admin/data/banks"),
      fetch("/api/admin/data/merchants"),
    ]);
    if (pr.ok) setPromos(await pr.json());
    if (br.ok) setBanks(await br.json());
    if (mr.ok) setMerchants(await mr.json());
    setLoading(false);
  }
  useEffect(() => { load(); }, [filterBank, showActive]); // eslint-disable-line react-hooks/exhaustive-deps

  function openNew()         { setForm({ ...EMPTY }); setIsNew(true);  setError(""); }
  function openEdit(p: Promo){ setForm({ ...p, card_types: [...p.card_types], days_of_week: [...p.days_of_week] }); setIsNew(false); setError(""); }

  function toggleCardType(t: string) {
    if (!form) return;
    const ct = form.card_types.includes(t) ? form.card_types.filter((x) => x !== t) : [...form.card_types, t];
    setForm({ ...form, card_types: ct });
  }
  function toggleDay(d: number) {
    if (!form) return;
    const dw = form.days_of_week.includes(d) ? form.days_of_week.filter((x) => x !== d) : [...form.days_of_week, d];
    setForm({ ...form, days_of_week: dw });
  }

  async function save() {
    if (!form) return;
    setError(""); setSaving(true);
    try {
      const method = isNew ? "POST" : "PATCH";
      const url    = isNew ? "/api/admin/data/promotions" : `/api/admin/data/promotions/${form.id}`;
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

  async function doDelete() {
    if (!delTarget) return;
    setDeleting(true);
    const res = await fetch(`/api/admin/data/promotions/${delTarget.id}`, { method: "DELETE" });
    if (res.ok) { setDelTarget(null); load(); }
    else { const d = await res.json(); setError(d.error ?? "Error"); setDelTarget(null); }
    setDeleting(false);
  }

  const bankName     = (id: string) => banks.find((b) => b.id === id)?.name ?? id;
  const merchantName = (id: string) => merchants.find((m) => m.id === id)?.name ?? id;

  return (
    <AdminShell>
      {delTarget && (
        <DeleteModal title={`${delTarget.bank_name ?? bankName(delTarget.bank_id)} ${delTarget.discount}%`}
                     onConfirm={doDelete} onCancel={() => setDelTarget(null)} loading={deleting} />
      )}

      <div className="admin-header">
        <h1 className="admin-title">Promociones</h1>
        <button className="admin-btn admin-btn-primary" onClick={openNew}>+ Nueva promo</button>
      </div>

      {error && <div className="admin-error">{error}</div>}

      {form && (
        <div className="admin-card" style={{ marginBottom: 24 }}>
          <p style={{ fontFamily: "var(--font-serif)", fontSize: 16, marginBottom: 20 }}>
            {isNew ? "Nueva promoción" : `Editar: ${form.id}`}
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {isNew && (
              <div className="admin-form-row">
                <label className="admin-label">ID (slug)</label>
                <input className="admin-input" value={form.id}
                  onChange={(e) => setForm({ ...form, id: e.target.value })} />
              </div>
            )}
            <div className="admin-form-row">
              <label className="admin-label">Banco</label>
              <select className="admin-input" value={form.bank_id}
                onChange={(e) => setForm({ ...form, bank_id: e.target.value })}>
                <option value="">— Seleccionar —</option>
                {banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div className="admin-form-row">
              <label className="admin-label">Comercio</label>
              <select className="admin-input" value={form.merchant_id}
                onChange={(e) => setForm({ ...form, merchant_id: e.target.value })}>
                <option value="">— Seleccionar —</option>
                {merchants.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div className="admin-form-row">
              <label className="admin-label">Descuento (%)</label>
              <input className="admin-input" type="number" min={1} max={100}
                value={form.discount} onChange={(e) => setForm({ ...form, discount: +e.target.value })} />
            </div>
            <div className="admin-form-row">
              <label className="admin-label">Tope (CLP, opcional)</label>
              <input className="admin-input" type="number" min={0}
                value={form.cap ?? ""} onChange={(e) => setForm({ ...form, cap: e.target.value ? +e.target.value : null })} />
            </div>
            <div className="admin-form-row">
              <label className="admin-label">Compra mínima (CLP, opcional)</label>
              <input className="admin-input" type="number" min={0}
                value={form.min_purchase ?? ""} onChange={(e) => setForm({ ...form, min_purchase: e.target.value ? +e.target.value : null })} />
            </div>
            <div className="admin-form-row">
              <label className="admin-label">Modalidad</label>
              <select className="admin-input" value={form.modality}
                onChange={(e) => setForm({ ...form, modality: e.target.value })}>
                <option value="presencial">Presencial</option>
                <option value="online">Online</option>
                <option value="both">Ambas</option>
              </select>
            </div>
            <div className="admin-form-row">
              <label className="admin-label">Inicio vigencia</label>
              <input className="admin-input" type="date"
                value={form.start_date ?? ""} onChange={(e) => setForm({ ...form, start_date: e.target.value || null })} />
            </div>
            <div className="admin-form-row">
              <label className="admin-label">Fin vigencia</label>
              <input className="admin-input" type="date"
                value={form.end_date ?? ""} onChange={(e) => setForm({ ...form, end_date: e.target.value || null })} />
            </div>
            <div className="admin-form-row">
              <label className="admin-label">Código (opcional)</label>
              <input className="admin-input" value={form.code ?? ""}
                onChange={(e) => setForm({ ...form, code: e.target.value || null })} />
            </div>
            <div className="admin-form-row">
              <label className="admin-label">Fuente</label>
              <input className="admin-input" value={form.source}
                onChange={(e) => setForm({ ...form, source: e.target.value })} />
            </div>
            <div className="admin-form-row">
              <label className="admin-label">Verificado el</label>
              <input className="admin-input" type="date" value={form.verified_at}
                onChange={(e) => setForm({ ...form, verified_at: e.target.value })} />
            </div>
            <div className="admin-form-row" style={{ gridColumn: "1 / -1" }}>
              <label className="admin-label">Condiciones (opcional)</label>
              <textarea className="admin-input" value={form.conditions ?? ""} rows={2}
                onChange={(e) => setForm({ ...form, conditions: e.target.value || null })} />
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label className="admin-label">Tipos de tarjeta</label>
            <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
              {["credit", "debit"].map((t) => (
                <label key={t} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                  <input type="checkbox" checked={form.card_types.includes(t)} onChange={() => toggleCardType(t)} />
                  {t === "credit" ? "Crédito" : "Débito"}
                </label>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label className="admin-label">Días de la semana (vacío = todos)</label>
            <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
              {DAYS.map((d, i) => (
                <label key={i} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, cursor: "pointer" }}>
                  <input type="checkbox" checked={form.days_of_week.includes(i)} onChange={() => toggleDay(i)} />
                  {d}
                </label>
              ))}
            </div>
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", marginBottom: 16 }}>
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
            Activa
          </label>

          <div style={{ display: "flex", gap: 10 }}>
            <button className="admin-btn admin-btn-primary" onClick={save} disabled={saving}>
              {saving ? "Guardando…" : "Guardar"}
            </button>
            <button className="admin-btn admin-btn-ghost" onClick={() => setForm(null)}>Cancelar</button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <select className="admin-input" style={{ maxWidth: 200 }} value={filterBank}
          onChange={(e) => setFilterBank(e.target.value)}>
          <option value="">Todos los bancos</option>
          {banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
          <input type="checkbox" checked={showActive} onChange={(e) => setShowActive(e.target.checked)} />
          Solo activas
        </label>
      </div>

      {loading ? <p style={{ color: "var(--ink-dim)", fontSize: 13 }}>Cargando…</p> : (
        <table className="admin-table">
          <thead>
            <tr><th>ID</th><th>Banco</th><th>Comercio</th><th>%</th><th>Tipos</th><th>Días</th><th>Vigencia</th><th>Estado</th><th></th></tr>
          </thead>
          <tbody>
            {promos.map((p) => (
              <tr key={p.id}>
                <td><code style={{ fontSize: 10, color: "var(--ink-dim)" }}>{p.id}</code></td>
                <td style={{ fontSize: 12 }}>{p.bank_name ?? bankName(p.bank_id)}</td>
                <td style={{ fontSize: 12 }}>{p.merchant_name ?? merchantName(p.merchant_id)}</td>
                <td style={{ fontWeight: 700, color: "var(--lime)" }}>{p.discount}%</td>
                <td style={{ fontSize: 11 }}>{p.card_types.join(", ")}</td>
                <td style={{ fontSize: 11, color: "var(--ink-dim)" }}>
                  {p.days_of_week.length ? p.days_of_week.map((d) => DAYS[d]).join(", ") : "Todos"}
                </td>
                <td style={{ fontSize: 11, color: "var(--ink-dim)" }}>
                  {p.end_date ? new Date(p.end_date).toLocaleDateString("es-CL") : "Sin límite"}
                </td>
                <td>
                  <span className={`admin-badge ${p.active ? "admin-badge-green" : "admin-badge-dim"}`}>
                    {p.active ? "Activa" : "Inactiva"}
                  </span>
                </td>
                <td>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="admin-btn admin-btn-ghost" style={{ padding: "4px 10px", fontSize: 11 }} onClick={() => openEdit(p)}>Editar</button>
                    <button className="admin-btn admin-btn-danger" style={{ padding: "4px 10px", fontSize: 11 }} onClick={() => setDelTarget(p)}>Eliminar</button>
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
