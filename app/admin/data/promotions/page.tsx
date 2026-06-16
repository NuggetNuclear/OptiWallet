"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "../../components/AdminShell";
import { DeleteModal } from "../../components/DeleteModal";

interface Promo {
  id: string; bank_id: string; card_types: string[]; card_ids: string[]; merchant_id: string;
  discount: number | null; discount_per_unit: number | null; discount_unit: string | null;
  stackable: boolean;
  cap: number | null; min_purchase: number | null;
  days_of_week: number[]; start_date: string | null; end_date: string | null;
  modality: string; code: string | null; conditions: string | null;
  source: string; verified_at: string; active: boolean;
  bank_name?: string; merchant_name?: string;
}
interface Bank     { id: string; name: string }
interface Merchant { id: string; name: string }
interface Card     { id: string; bank_id: string; name: string; type: string }

const DAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const CARD_TYPE_LABEL = (t: string) => (t === "credit" ? "Crédito" : t === "debit" ? "Débito" : "Prepago");

const EMPTY: Promo = {
  id: "", bank_id: "", card_types: ["credit"], card_ids: [], merchant_id: "",
  discount: 10, discount_per_unit: null, discount_unit: null,
  stackable: false,
  cap: null, min_purchase: null,
  days_of_week: [], start_date: null, end_date: null,
  modality: "both", code: null, conditions: null,
  source: "", verified_at: new Date().toISOString().slice(0, 10), active: true,
};

export default function PromotionsPage() {
  const [promos,    setPromos]    = useState<Promo[]>([]);
  const [banks,     setBanks]     = useState<Bank[]>([]);
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [cards,     setCards]     = useState<Card[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [form,      setForm]      = useState<Promo | null>(null);
  const [isNew,     setIsNew]     = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState("");
  const [success,   setSuccess]   = useState("");
  const [delTarget, setDelTarget] = useState<Promo | null>(null);
  const [deleting,  setDeleting]  = useState(false);
  const [filterBank, setFilterBank]  = useState("");
  const [filterMerchant, setFilterMerchant] = useState("");
  const [showActive, setShowActive]  = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showBulkDel, setShowBulkDel] = useState(false);
  const [totpCode, setTotpCode] = useState("");
  const [bulkDeleting, setBulkDeleting] = useState(false);

  async function load() {
    const params = new URLSearchParams();
    if (filterBank) params.set("bankId", filterBank);
    if (filterMerchant) params.set("merchantId", filterMerchant);
    if (showActive) params.set("active", "true");
    const [pr, br, mr, cr] = await Promise.all([
      fetch(`/api/admin/data/promotions?${params}`),
      fetch("/api/admin/data/banks"),
      fetch("/api/admin/data/merchants"),
      fetch("/api/admin/data/cards"),
    ]);
    if (pr.ok) setPromos(await pr.json());
    if (br.ok) setBanks(await br.json());
    if (mr.ok) setMerchants(await mr.json());
    if (cr.ok) setCards(await cr.json());
    setLoading(false);
    setSelectedIds([]);
  }
  useEffect(() => { (async () => { await load(); })(); }, [filterBank, filterMerchant, showActive]); // eslint-disable-line react-hooks/exhaustive-deps

  function openNew()         { setForm({ ...EMPTY }); setIsNew(true);  setError(""); setSuccess(""); }
  function openEdit(p: Promo){ setForm({ ...p, card_types: [...p.card_types], card_ids: [...(p.card_ids ?? [])], days_of_week: [...p.days_of_week] }); setIsNew(false); setError(""); setSuccess(""); }

  function toggleCardType(t: string) {
    if (!form) return;
    const ct = form.card_types.includes(t) ? form.card_types.filter((x) => x !== t) : [...form.card_types, t];
    setForm({ ...form, card_types: ct });
  }
  function toggleCardId(id: string) {
    if (!form) return;
    const ids = form.card_ids.includes(id) ? form.card_ids.filter((x) => x !== id) : [...form.card_ids, id];
    setForm({ ...form, card_ids: ids });
  }
  // Al cambiar el banco, las tarjetas específicas previas dejan de ser válidas.
  function setBank(bankId: string) {
    if (!form) return;
    setForm({ ...form, bank_id: bankId, card_ids: [] });
  }
  function toggleDay(d: number) {
    if (!form) return;
    const dw = form.days_of_week.includes(d) ? form.days_of_week.filter((x) => x !== d) : [...form.days_of_week, d];
    setForm({ ...form, days_of_week: dw });
  }

  async function save() {
    if (!form) return;
    setError(""); setSuccess(""); setSaving(true);
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
      setSuccess(isNew ? "Promoción creada" : "Cambios guardados");
      setForm(null); load();
    } catch { setError("Error de red"); } finally { setSaving(false); }
  }

  async function doDelete() {
    if (!delTarget) return;
    setDeleting(true);
    const res = await fetch(`/api/admin/data/promotions/${delTarget.id}`, { method: "DELETE" });
    if (res.ok) { setSuccess("Promoción eliminada"); setDelTarget(null); load(); }
    else { const d = await res.json(); setError(d.error ?? "Error"); setDelTarget(null); }
    setDeleting(false);
  }

  async function doBulkDelete() {
    if (selectedIds.length === 0 || totpCode.length !== 6) return;
    setError(""); setSuccess(""); setBulkDeleting(true);
    try {
      const res = await fetch("/api/admin/data/promotions/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds, code: totpCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Error al eliminar");
        setShowBulkDel(false);
        return;
      }
      setSuccess(`${selectedIds.length} promociones eliminadas correctamente`);
      setSelectedIds([]);
      setShowBulkDel(false);
      load();
    } catch {
      setError("Error de red");
      setShowBulkDel(false);
    } finally {
      setBulkDeleting(false);
    }
  }

  const bankName     = (id: string) => banks.find((b) => b.id === id)?.name ?? id;
  const merchantName = (id: string) => merchants.find((m) => m.id === id)?.name ?? id;
  const cardName     = (id: string) => cards.find((c) => c.id === id)?.name ?? id;

  return (
    <AdminShell>
      {delTarget && (
        <DeleteModal title={`${delTarget.bank_name ?? bankName(delTarget.bank_id)} ${delTarget.discount}%`}
                     onConfirm={doDelete} onCancel={() => setDelTarget(null)} loading={deleting} />
      )}

      {showBulkDel && (
        <div className="admin-modal-overlay">
          <div className="admin-modal" role="dialog" aria-modal="true" style={{ maxWidth: 480 }}>
            <p className="admin-modal-title">Confirmar eliminación masiva</p>
            <p style={{ fontSize: 13, color: "var(--ink-dim)", marginBottom: 16 }}>
              Estás a punto de eliminar <strong>{selectedIds.length}</strong> promociones. Esta acción no se puede deshacer.
            </p>
            <div style={{ maxHeight: 120, overflowY: "auto", background: "var(--bg-2)", padding: 10, borderRadius: 8, marginBottom: 20, border: "1px solid var(--line)" }}>
              <ul style={{ margin: 0, paddingLeft: 20, fontSize: 11, fontFamily: "var(--font-jetbrains)", color: "var(--ink-dim)" }}>
                {selectedIds.map((id) => (
                  <li key={id}>{id}</li>
                ))}
              </ul>
            </div>
            <div className="admin-form-row" style={{ marginBottom: 20 }}>
              <label className="admin-label">Código TOTP (2FA)</label>
              <input
                className="admin-input"
                type="text"
                maxLength={6}
                placeholder="000000"
                style={{ textAlign: "center", fontSize: 20, letterSpacing: 4, fontFamily: "var(--font-jetbrains)" }}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
              />
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                className="admin-btn admin-btn-danger"
                onClick={doBulkDelete}
                disabled={bulkDeleting || totpCode.length !== 6}
              >
                {bulkDeleting ? "Eliminando…" : "Confirmar eliminación"}
              </button>
              <button
                className="admin-btn admin-btn-ghost"
                onClick={() => setShowBulkDel(false)}
                disabled={bulkDeleting}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="admin-header">
        <h1 className="admin-title">Promociones</h1>
        <button className="admin-btn admin-btn-primary" onClick={openNew}>+ Nueva promo</button>
      </div>

      {error && <div className="admin-error">{error}</div>}
      {success && <div className="admin-success">{success}</div>}

      {form && (
        <div className="admin-card" style={{ marginBottom: 24 }}>
          <p className="admin-card-title">{isNew ? "Nueva promoción" : `Editar: ${form.id}`}</p>
          <div className="admin-form-grid">
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
                onChange={(e) => setBank(e.target.value)}>
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
              <label className="admin-label">Tipo de descuento</label>
              <div className="admin-check-group" style={{ flexDirection: "row", gap: 16 }}>
                <label className="admin-check-row">
                  <input
                    type="radio"
                    name="discount_type"
                    checked={form.discount !== null}
                    onChange={() => setForm({ ...form, discount: 10, discount_per_unit: null, discount_unit: null })}
                  />
                  % Porcentaje
                </label>
                <label className="admin-check-row">
                  <input
                    type="radio"
                    name="discount_type"
                    checked={form.discount_unit === "liter"}
                    onChange={() => setForm({ ...form, discount: null, discount_per_unit: 100, discount_unit: "liter" })}
                  />
                  $/litro (bencina por app)
                </label>
              </div>
            </div>
            {form.discount !== null ? (
              <div className="admin-form-row">
                <label className="admin-label">Descuento (%)</label>
                <input className="admin-input" type="number" min={1} max={100}
                  value={form.discount} onChange={(e) => setForm({ ...form, discount: +e.target.value })} />
              </div>
            ) : (
              <div className="admin-form-row">
                <label className="admin-label">Descuento por litro (CLP)</label>
                <input className="admin-input" type="number" min={1}
                  placeholder="ej. 100"
                  value={form.discount_per_unit ?? ""}
                  onChange={(e) => setForm({ ...form, discount_per_unit: e.target.value ? +e.target.value : null })} />
              </div>
            )}
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
            <div className="admin-form-row span-2">
              <label className="admin-label">Condiciones (opcional)</label>
              <textarea className="admin-input" value={form.conditions ?? ""} rows={2}
                onChange={(e) => setForm({ ...form, conditions: e.target.value || null })} />
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label className="admin-label">Tipos de tarjeta</label>
            <div className="admin-check-group">
              {["credit", "debit", "prepaid"].map((t) => (
                <label key={t} className="admin-check-row">
                  <input type="checkbox" checked={form.card_types.includes(t)} onChange={() => toggleCardType(t)} />
                  {CARD_TYPE_LABEL(t)}
                </label>
              ))}
            </div>
          </div>

          {/* ─── Tarjeta única: restringir a tarjetas específicas ───────────── */}
          <div
            style={{
              marginBottom: 16,
              border: "1px solid var(--line)",
              borderRadius: 10,
              padding: 14,
              background: form.card_ids.length > 0 ? "rgba(212,255,58,0.04)" : "transparent",
            }}
          >
            <label className="admin-check-row" style={{ marginBottom: form.card_ids.length > 0 ? 12 : 0 }}>
              <input
                type="checkbox"
                checked={form.card_ids.length > 0}
                disabled={!form.bank_id}
                onChange={(e) => {
                  if (!form) return;
                  if (e.target.checked) {
                    // Pre-seleccionar la primera tarjeta del banco para que el check tenga efecto.
                    const first = cards.find((c) => c.bank_id === form.bank_id);
                    setForm({ ...form, card_ids: first ? [first.id] : [] });
                  } else {
                    setForm({ ...form, card_ids: [] });
                  }
                }}
              />
              Solo para tarjetas específicas
              <span style={{ fontSize: 11, color: "var(--ink-dim)", fontFamily: "var(--font-jetbrains)" }}>
                (ej. solo la Mastercard Black — ignora el filtro por tipo)
              </span>
            </label>

            {!form.bank_id && (
              <p style={{ fontSize: 11, color: "var(--ink-dim)", margin: 0 }}>
                Selecciona un banco primero para elegir sus tarjetas.
              </p>
            )}

            {form.card_ids.length > 0 && form.bank_id && (
              <div className="admin-check-group" style={{ marginTop: 4 }}>
                {cards.filter((c) => c.bank_id === form.bank_id).length === 0 ? (
                  <p style={{ fontSize: 12, color: "var(--ink-dim)", margin: 0 }}>
                    Este banco no tiene tarjetas cargadas.
                  </p>
                ) : (
                  cards
                    .filter((c) => c.bank_id === form.bank_id)
                    .map((c) => (
                      <label key={c.id} className="admin-check-row">
                        <input
                          type="checkbox"
                          checked={form.card_ids.includes(c.id)}
                          onChange={() => toggleCardId(c.id)}
                        />
                        {c.name}
                        <span style={{ fontSize: 10, color: "var(--ink-dim)", fontFamily: "var(--font-jetbrains)", textTransform: "uppercase" }}>
                          {CARD_TYPE_LABEL(c.type)}
                        </span>
                      </label>
                    ))
                )}
              </div>
            )}
          </div>

          <div style={{ marginBottom: 16 }}>
            <label className="admin-label">Días de la semana (vacío = todos)</label>
            <div className="admin-check-group">
              {DAYS.map((d, i) => (
                <label key={i} className="admin-check-row" style={{ fontSize: 12 }}>
                  <input type="checkbox" checked={form.days_of_week.includes(i)} onChange={() => toggleDay(i)} />
                  {d}
                </label>
              ))}
            </div>
          </div>

          <label className="admin-check-row" style={{ marginBottom: 16 }}>
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
            Activa
          </label>

          <label className="admin-check-row" style={{ marginBottom: 16 }}>
            <input type="checkbox" checked={form.stackable} onChange={(e) => setForm({ ...form, stackable: e.target.checked })} />
            Apilable <span style={{ fontSize: 11, color: "var(--ink-dim)", fontFamily: "var(--font-jetbrains)" }}>(puede combinarse con otras promos simultáneamente)</span>
          </label>

          <div className="admin-form-actions">
            <button className="admin-btn admin-btn-primary" onClick={save} disabled={saving}>
              {saving ? "Guardando…" : "Guardar"}
            </button>
            <button className="admin-btn admin-btn-ghost" onClick={() => setForm(null)}>Cancelar</button>
          </div>
        </div>
      )}

      <div className="admin-toolbar" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          <select className="admin-input" style={{ maxWidth: 200 }} value={filterBank}
            onChange={(e) => setFilterBank(e.target.value)}>
            <option value="">Todos los bancos</option>
            {banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <select className="admin-input" style={{ maxWidth: 200 }} value={filterMerchant}
            onChange={(e) => setFilterMerchant(e.target.value)}>
            <option value="">Todos los comercios</option>
            {merchants.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <label className="admin-check-row">
            <input type="checkbox" checked={showActive} onChange={(e) => setShowActive(e.target.checked)} />
            Solo activas
          </label>
        </div>
        {selectedIds.length > 0 && (
          <button
            className="admin-btn admin-btn-danger"
            onClick={() => {
              setTotpCode("");
              setError("");
              setSuccess("");
              setShowBulkDel(true);
            }}
          >
            Eliminar seleccionadas ({selectedIds.length})
          </button>
        )}
      </div>

      {loading ? (
        <div className="admin-loading"><span className="admin-spinner" aria-hidden="true" />Cargando…</div>
      ) : promos.length === 0 ? (
        <div className="admin-empty">
          <div className="admin-empty-text">
            {filterBank || filterMerchant || showActive
              ? "Ninguna promoción coincide con los filtros."
              : 'No hay promociones todavía. Crea la primera con "+ Nueva promo".'}
          </div>
        </div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th style={{ width: 40, textAlign: "center" }}>
                  <input
                    type="checkbox"
                    checked={promos.length > 0 && selectedIds.length === promos.length}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedIds(promos.map((p) => p.id));
                      } else {
                        setSelectedIds([]);
                      }
                    }}
                  />
                </th>
                <th>ID</th><th>Banco</th><th>Comercio</th><th>%</th><th>Tipos</th><th>Días</th><th>Vigencia</th><th>Estado</th><th></th>
              </tr>
            </thead>
            <tbody>
              {promos.map((p) => (
                <tr key={p.id}>
                  <td style={{ textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(p.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedIds([...selectedIds, p.id]);
                        } else {
                          setSelectedIds(selectedIds.filter((id) => id !== p.id));
                        }
                      }}
                    />
                  </td>
                  <td><code className="admin-code" style={{ fontSize: 10 }}>{p.id}</code></td>
                  <td style={{ fontSize: 12 }}>{p.bank_name ?? bankName(p.bank_id)}</td>
                  <td style={{ fontSize: 12 }}>{p.merchant_name ?? merchantName(p.merchant_id)}</td>
                  <td style={{ fontWeight: 700, color: "var(--lime)" }}>
                    {p.discount !== null
                      ? `${p.discount}%`
                      : p.discount_per_unit !== null
                        ? `$${p.discount_per_unit}/L`
                        : "—"}
                  </td>
                  <td style={{ fontSize: 11 }}>
                    {p.card_ids && p.card_ids.length > 0 ? (
                      <span
                        title={p.card_ids.map(cardName).join(", ")}
                        style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--lime)", fontWeight: 600 }}
                      >
                        🎯 {p.card_ids.length === 1 ? cardName(p.card_ids[0]) : `${p.card_ids.length} tarjetas`}
                      </span>
                    ) : (
                      p.card_types.map(CARD_TYPE_LABEL).join(", ")
                    )}
                  </td>
                  <td className="admin-cell-dim" style={{ fontSize: 11 }}>
                    {p.days_of_week.length ? p.days_of_week.map((d) => DAYS[d]).join(", ") : "Todos"}
                  </td>
                  <td className="admin-cell-dim" style={{ fontSize: 11 }}>
                    {p.end_date ? new Date(p.end_date).toLocaleDateString("es-CL") : "Sin límite"}
                  </td>
                  <td>
                    <span className={`admin-badge ${p.active ? "admin-badge-green" : "admin-badge-dim"}`}>
                      {p.active ? "Activa" : "Inactiva"}
                    </span>
                  </td>
                  <td>
                    <div className="admin-actions">
                      <button className="admin-btn admin-btn-ghost admin-btn-sm" onClick={() => openEdit(p)}>Editar</button>
                      <button className="admin-btn admin-btn-danger admin-btn-sm" onClick={() => setDelTarget(p)}>Eliminar</button>
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
