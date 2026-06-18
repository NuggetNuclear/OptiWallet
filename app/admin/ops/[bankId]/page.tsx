"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AdminShell } from "../../components/AdminShell";
import { ConfirmModal } from "../../components/ConfirmModal";

interface Staged {
  id: number;
  bank_id: string;
  status: string;
  merchant_name: string;
  merchant_id: string | null;
  discount: number | null;
  discount_per_unit: number | null;
  cap: number | null;
  min_purchase: number | null;
  days_of_week: number[];
  card_types: string[];
  source_cards: string[];
  modality: string | null;
  start_date: string | null;
  end_date: string | null;
  stackable: boolean;
  conditions: string | null;
  source: string;
  warnings: string[];
  created_promo_id: string | null;
}
interface Merchant { id: string; name: string; aliases: string[]; category_id?: string }
interface Category { id: string; label: string; emoji: string }
interface Card     { id: string; bank_id: string; name: string; type: string }
type Suggestion = { id: string; name: string; score: number };

const DAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const WARN_LABEL: Record<string, string> = {
  comercio_nuevo: "Comercio nuevo",
  sin_fecha_termino: "Sin fecha de término",
  sin_tipo_tarjeta: "Sin tipo de tarjeta",
  descuento_ambiguo: "Descuento ambiguo",
  nombre_muy_largo: `⚠️ Nombre >40 chars`,
};

function slugify(s: string) {
  return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64);
}

/** Fallback instantáneo por solape de tokens (mientras la IA carga o si no hay). */
function suggestMerchants(name: string, merchants: Merchant[]): Suggestion[] {
  const norm = (s: string) => slugify(s).split("-").filter(Boolean);
  const target = new Set(norm(name));
  if (target.size === 0) return [];
  return merchants
    .map((m) => {
      const toks = new Set([...norm(m.name), ...m.aliases.flatMap(norm)]);
      let shared = 0;
      target.forEach((t) => { if (toks.has(t)) shared++; });
      return { id: m.id, name: m.name, score: shared / target.size };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

export default function BankReview() {
  const { bankId } = useParams<{ bankId: string }>();
  const [rows, setRows] = useState<Staged[]>([]);
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [status, setStatus] = useState("pending");
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [bulkApproving, setBulkApproving] = useState(false);
  const [confirmStep, setConfirmStep] = useState<"confirm_all" | "confirm_new_merchants" | null>(null);

  async function load() {
    setLoading(true);
    const [sr, mr, cr, cdr] = await Promise.all([
      fetch(`/api/admin/ops/${bankId}/staging?status=${status}`),
      fetch("/api/admin/data/merchants"),
      fetch("/api/admin/data/categories"),
      fetch("/api/admin/data/cards"),
    ]);
    if (sr.ok) setRows(await sr.json());
    if (mr.ok) setMerchants(await mr.json());
    if (cr.ok) setCategories(await cr.json());
    if (cdr.ok) setCards(await cdr.json());
    setLoading(false);
  }
  useEffect(() => { (async () => { await load(); })(); }, [bankId, status]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleApproveAll() {
    setConfirmStep("confirm_all");
  }

  function handleConfirmStep1() {
    setConfirmStep("confirm_new_merchants");
  }

  async function handleConfirmStep2() {
    setConfirmStep(null);
    setBulkApproving(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch(`/api/admin/ops/${bankId}/approve-all`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Error al auto-aprobar el backlog.");
        return;
      }
      let msg = `Se aprobaron ${data.approvedCount} promociones.`;
      if (data.createdMerchantsCount > 0) {
        msg += ` Se crearon ${data.createdMerchantsCount} comercios nuevos.`;
      }
      if (data.createdCategoriesCount > 0) {
        msg += ` Se crearon ${data.createdCategoriesCount} categorías nuevas.`;
      }
      if (data.errors && data.errors.length > 0) {
        msg += ` (Se omitieron ${data.errors.length} filas por errores de validación, ver consola).`;
        console.warn("Errores durante auto-aprobación:", data.errors);
      }
      setSuccess(msg);
      load();
    } catch (err) {
      setError("Error de red al intentar auto-aprobar.");
    } finally {
      setBulkApproving(false);
    }
  }

  return (
    <AdminShell>
      <div className="admin-header">
        <div>
          <h1 className="admin-title">Revisión · {bankId}</h1>
          <p className="admin-subtitle">Aprueba promos a producción o recházalas</p>
        </div>
        <Link href="/admin/ops" className="admin-btn admin-btn-ghost">← Operaciones</Link>
      </div>

      {error && <div className="admin-error">{error}</div>}
      {success && <div className="admin-success">{success}</div>}

      <div className="admin-toolbar" style={{ display: "flex", gap: 8, marginBottom: 16, justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 8 }}>
          {["pending", "approved", "rejected"].map((s) => (
            <button
              key={s}
              className={`admin-btn admin-btn-sm ${status === s ? "admin-btn-primary" : "admin-btn-ghost"}`}
              onClick={() => { setStatus(s); setExpanded(null); }}
            >
              {s === "pending" ? "Pendientes" : s === "approved" ? "Aprobadas" : "Rechazadas"}
            </button>
          ))}
        </div>
        {status === "pending" && rows.length > 0 && !loading && (
          <button
            className="admin-btn admin-btn-sm admin-btn-primary"
            style={{ backgroundColor: "var(--lime)", color: "#000" }}
            onClick={handleApproveAll}
            disabled={bulkApproving}
          >
            {bulkApproving ? "Aprobando todo..." : "⚡ Auto-aprobar backlog"}
          </button>
        )}
      </div>

      {loading ? (
        <div className="admin-loading"><span className="admin-spinner" aria-hidden="true" />Cargando…</div>
      ) : rows.length === 0 ? (
        <div className="admin-empty"><div className="admin-empty-text">No hay promos {status === "pending" ? "pendientes" : status === "approved" ? "aprobadas" : "rechazadas"}.</div></div>
      ) : (
        rows.map((r) => (
          <ReviewRow
            key={r.id}
            row={r}
            merchants={merchants}
            categories={categories}
            cards={cards}
            expanded={expanded === r.id}
            onToggle={() => setExpanded(expanded === r.id ? null : r.id)}
            onDone={(msg) => { setSuccess(msg); setError(""); setExpanded(null); load(); }}
            onError={(msg) => { setError(msg); setSuccess(""); }}
            onCategoryCreated={(id, label, emoji) => {
              setCategories((prev) => [...prev, { id, label, emoji }]);
            }}
          />
        ))
      )}

      {confirmStep === "confirm_all" && (
        <ConfirmModal
          title="Auto-aprobar todo el backlog"
          description={`¿Estás seguro de que quieres auto-aprobar todas las promociones pendientes para el banco "${bankId}"?`}
          confirmText="Continuar"
          onConfirm={handleConfirmStep1}
          onCancel={() => setConfirmStep(null)}
        />
      )}
      {confirmStep === "confirm_new_merchants" && (
        <ConfirmModal
          title="Confirmación de comercios nuevos"
          description="¡Atención! Este proceso creará comercios y categorías nuevas de forma automática en la base de datos para aquellas promociones que no estén mapeadas previamente. ¿Confirmas esta acción definitiva?"
          confirmText="Sí, auto-aprobar todo"
          onConfirm={handleConfirmStep2}
          onCancel={() => setConfirmStep(null)}
        />
      )}
    </AdminShell>
  );
}

const CARD_TYPE_LABEL = (t: string) => (t === "credit" ? "Crédito" : t === "debit" ? "Débito" : "Prepago");

function ReviewRow({
  row, merchants, categories, cards, expanded, onToggle, onDone, onError, onCategoryCreated,
}: {
  row: Staged; merchants: Merchant[]; categories: Category[]; cards: Card[];
  expanded: boolean; onToggle: () => void;
  onDone: (msg: string) => void; onError: (msg: string) => void;
  onCategoryCreated: (id: string, label: string, emoji: string) => void;
}) {
  const isNewCandidate = !row.merchant_id;
  const [mode, setMode] = useState<"existing" | "new">(isNewCandidate ? "new" : "existing");
  const [merchantId, setMerchantId] = useState(row.merchant_id ?? "");
  const [nmId, setNmId] = useState(slugify(row.merchant_name));
  const [nmName, setNmName] = useState(row.merchant_name);
  const [nmCat, setNmCat] = useState("");
  // overrides — todos los campos editables (igual que el form de promociones)
  const [discountType, setDiscountType] = useState<"percent" | "perliter">(
    row.discount_per_unit != null ? "perliter" : "percent"
  );
  const [discount, setDiscount] = useState<number | null>(row.discount);
  const [discountPerUnit, setDiscountPerUnit] = useState<number | null>(row.discount_per_unit);
  const [cap, setCap] = useState<number | null>(row.cap);
  const [minPurchase, setMinPurchase] = useState<number | null>(row.min_purchase);
  const [modality, setModality] = useState(row.modality ?? "presencial");
  const [startDate, setStartDate] = useState(row.start_date ? row.start_date.slice(0, 10) : "");
  const [endDate, setEndDate] = useState(row.end_date ? row.end_date.slice(0, 10) : "");
  const [days, setDays] = useState<number[]>(row.days_of_week ?? []);
  const [codeVal, setCodeVal] = useState("");
  const [conditionsText, setConditionsText] = useState(row.conditions ?? "");
  const [cardTypes, setCardTypes] = useState<string[]>(row.card_types ?? ["credit"]);
  const [cardIds, setCardIds] = useState<string[]>([]);
  const [stackable, setStackable] = useState(row.stackable ?? false);
  const [busy, setBusy] = useState(false);

  // Mini-form de nueva categoría inline
  const [showNewCat, setShowNewCat] = useState(false);
  const [newCatId, setNewCatId] = useState("");
  const [newCatLabel, setNewCatLabel] = useState("");
  const [newCatEmoji, setNewCatEmoji] = useState("");
  const [savingCat, setSavingCat] = useState(false);
  const [catError, setCatError] = useState("");

  async function createCategory() {
    if (!newCatId.trim() || !newCatLabel.trim() || !newCatEmoji.trim()) {
      setCatError("Todos los campos son requeridos"); return;
    }
    setSavingCat(true); setCatError("");
    try {
      const res = await fetch("/api/admin/data/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: newCatId.trim(), label: newCatLabel.trim(), emoji: newCatEmoji.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setCatError(data.error ?? "Error"); return; }
      onCategoryCreated(newCatId.trim(), newCatLabel.trim(), newCatEmoji.trim());
      setNmCat(newCatId.trim());
      setShowNewCat(false);
      setNewCatId(""); setNewCatLabel(""); setNewCatEmoji("");
    } catch { setCatError("Error de red"); }
    finally { setSavingCat(false); }
  }

  function toggleCardType(t: string) {
    setCardTypes((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]);
  }
  function toggleCardId(id: string) {
    setCardIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  const suggestions = useMemo(() => suggestMerchants(row.merchant_name, merchants), [row.merchant_name, merchants]);
  const isPending = row.status === "pending";

  // Sugerencias por IA (embeddings). Cae a `suggestions` (tokens) si no hay IA.
  const [aiCands, setAiCands] = useState<Suggestion[] | null>(null);
  const [aiProvider, setAiProvider] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  // Autorrelleno de campos vía IA generativa
  const [autofilling, setAutofilling] = useState(false);
  const [autofillMsg, setAutofillMsg] = useState("");

  async function autofill() {
    setAutofilling(true);
    setAutofillMsg("");
    try {
      const res = await fetch(`/api/admin/ops/staging/${row.id}/autofill`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) { setAutofillMsg(data.error ?? "Error al autorrellenar"); return; }
      // Aplicar solo los campos que la IA devolvió con valor
      if (data.discount !== null)        setDiscount(data.discount);
      if (data.discount_per_unit !== null) { setDiscountPerUnit(data.discount_per_unit); setDiscountType("perliter"); }
      else if (data.discount !== null)   setDiscountType("percent");
      if (data.cap !== null)             setCap(data.cap);
      if (data.min_purchase !== null)    setMinPurchase(data.min_purchase);
      if (data.modality)                 setModality(data.modality);
      if (data.start_date)               setStartDate(data.start_date);
      if (data.end_date)                 setEndDate(data.end_date);
      if (Array.isArray(data.days_of_week)) setDays(data.days_of_week);
      if (data.code)                     setCodeVal(data.code);
      if (data.conditions)               setConditionsText(data.conditions);
      if (Array.isArray(data.card_types) && data.card_types.length > 0) setCardTypes(data.card_types);
      if (typeof data.stackable === "boolean") setStackable(data.stackable);
      setAutofillMsg("✓ Campos completados — revisa antes de aprobar");
    } catch { setAutofillMsg("Error de red"); }
    finally { setAutofilling(false); }
  }

  useEffect(() => {
    if (!expanded) return;
    let cancel = false;
    (async () => {
      setAiLoading(true);
      try {
        const res = await fetch("/api/admin/ops/suggest-merchant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: row.merchant_name, withCategory: true }),
        });
        if (!res.ok || cancel) return;
        const data = await res.json();
        if (cancel) return;
        setAiCands(data.candidates ?? []);
        setAiProvider(data.provider ?? "");
        if (data.suggested_category) setNmCat((c) => c || data.suggested_category);
      } catch { /* silencioso: queda el fallback por tokens */ }
      finally { if (!cancel) setAiLoading(false); }
    })();
    return () => { cancel = true; };
  }, [expanded, row.merchant_name]);

  // Qué mostrar en la caja: IA si ya respondió con candidatos, si no tokens.
  const shownSuggestions: Suggestion[] = aiCands && aiCands.length > 0 ? aiCands : suggestions;
  const sourceLabel = aiLoading
    ? "analizando…"
    : aiCands
      ? (aiProvider === "tokens" || aiProvider === "tokens-fallback" || aiProvider === "none"
          ? "matching por tokens (sin IA)"
          : `embeddings · ${aiProvider}`)
      : "matching por tokens";

  async function approve() {
    setBusy(true);
    try {
      const overrides = {
        discount: discountType === "percent" ? discount : null,
        discount_per_unit: discountType === "perliter" ? discountPerUnit : null,
        discount_unit: discountType === "perliter" ? "liter" : null,
        cap,
        min_purchase: minPurchase,
        modality,
        start_date: startDate || null,
        end_date: endDate || null,
        days_of_week: days,
        code: codeVal || null,
        conditions: conditionsText || null,
        card_types: cardTypes,
        card_ids: cardIds,
        stackable,
      };
      const payload = mode === "new"
        ? { merchant_mode: "new", new_merchant: { id: nmId, name: nmName, category_id: nmCat, aliases: [] }, overrides }
        : { merchant_mode: "existing", merchant_id: merchantId, overrides };
      const res = await fetch(`/api/admin/ops/staging/${row.id}/approve`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { onError(data.error ?? "Error al aprobar"); return; }
      onDone(`Aprobada: ${data.promo_id}`);
    } catch { onError("Error de red"); } finally { setBusy(false); }
  }

  async function reject() {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/ops/staging/${row.id}/reject`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) { onError(data.error ?? "Error"); return; }
      onDone(`Rechazada: ${row.merchant_name}`);
    } catch { onError("Error de red"); } finally { setBusy(false); }
  }

  return (
    <div className="admin-card" style={{ marginBottom: 10, padding: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 700, color: "var(--lime)" }}>
            {row.discount != null ? `${row.discount}%` : row.discount_per_unit != null ? `$${row.discount_per_unit}/L` : "—"}
          </span>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{row.merchant_name}</span>
          <span className="admin-cell-dim" style={{ fontSize: 11 }}>
            {row.days_of_week.length ? row.days_of_week.map((d) => DAYS[d]).join(", ") : "Todos los días"}
          </span>
          {row.warnings.map((w) => (
            <span key={w} className="admin-badge admin-badge-dim" style={{ fontSize: 10 }}>{WARN_LABEL[w] ?? w}</span>
          ))}
          {row.created_promo_id && (
            <span className="admin-badge admin-badge-green" style={{ fontSize: 10 }}>→ {row.created_promo_id}</span>
          )}
        </div>
        {isPending && (
          <div className="admin-actions">
            <button className="admin-btn admin-btn-ghost admin-btn-sm" onClick={onToggle}>{expanded ? "Cerrar" : "Revisar"}</button>
            <button className="admin-btn admin-btn-danger admin-btn-sm" onClick={reject} disabled={busy}>Rechazar</button>
          </div>
        )}
      </div>

      {expanded && isPending && (
        <div style={{ marginTop: 14, borderTop: "1px solid var(--line)", paddingTop: 14 }}>
          {/* -- Resolver comercio ------------------------------------------- */}
          <label className="admin-label">Comercio</label>
          <div className="admin-check-group" style={{ flexDirection: "row", gap: 16, marginBottom: 10 }}>
            <label className="admin-check-row">
              <input type="radio" checked={mode === "existing"} onChange={() => setMode("existing")} /> Mapear a existente
            </label>
            <label className="admin-check-row">
              <input type="radio" checked={mode === "new"} onChange={() => setMode("new")} /> Crear nuevo
            </label>
          </div>

          {/* Caja de sugerencias — IA por embeddings, fallback a tokens */}
          <div style={{ marginBottom: 12, border: "1px dashed var(--line)", borderRadius: 8, padding: 10, background: "var(--bg-2)" }}>
            <div style={{ fontSize: 10, color: "var(--ink-dim)", fontFamily: "var(--font-jetbrains)", textTransform: "uppercase", marginBottom: 6 }}>
              Sugerencias <span style={{ opacity: 0.6 }}> · {sourceLabel}</span>
            </div>
            {aiLoading && !aiCands ? (
              <span style={{ fontSize: 12, color: "var(--ink-dim)" }}><span className="admin-spinner" aria-hidden="true" /> analizando…</span>
            ) : shownSuggestions.length === 0 ? (
              <span style={{ fontSize: 12, color: "var(--ink-dim)" }}>Sin coincidencias. Probablemente sea un comercio nuevo.</span>
            ) : (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {shownSuggestions.map((s) => (
                  <button key={s.id} className="admin-btn admin-btn-ghost admin-btn-sm"
                    onClick={() => { setMode("existing"); setMerchantId(s.id); }}>
                    {s.name}
                    <span style={{ opacity: 0.5, fontFamily: "var(--font-jetbrains)", fontSize: 10 }}> {Math.round(s.score * 100)}%</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {mode === "existing" ? (
            <div className="admin-form-row" style={{ marginBottom: 14 }}>
              <select className="admin-input" style={{ maxWidth: 320 }} value={merchantId} onChange={(e) => setMerchantId(e.target.value)}>
                <option value="">— Seleccionar comercio —</option>
                {merchants.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
          ) : (
            <div className="admin-form-grid" style={{ marginBottom: 14 }}>
              <div className="admin-form-row">
                <label className="admin-label">ID (slug)</label>
                <input className="admin-input" value={nmId} onChange={(e) => setNmId(e.target.value)} />
              </div>
              <div className="admin-form-row">
                <label className="admin-label">Nombre</label>
                <input className="admin-input" value={nmName} onChange={(e) => setNmName(e.target.value)} />
              </div>
              <div className="admin-form-row">
                <label className="admin-label">Categoría</label>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <select className="admin-input" value={nmCat} onChange={(e) => setNmCat(e.target.value)}>
                    <option value="">— Seleccionar —</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
                  </select>
                  <button
                    className="admin-btn admin-btn-ghost admin-btn-sm"
                    onClick={() => { setShowNewCat((v) => !v); setCatError(""); }}
                    title="Crear nueva categoría"
                    style={{ flexShrink: 0 }}
                  >+</button>
                </div>
                {showNewCat && (
                  <div style={{ marginTop: 8, padding: 10, border: "1px dashed var(--line)", borderRadius: 8, background: "var(--bg-2)" }}>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                      <input className="admin-input" style={{ width: 120 }} placeholder="id (slug)" value={newCatId} onChange={(e) => setNewCatId(e.target.value)} />
                      <input className="admin-input" style={{ flex: 1, minWidth: 120 }} placeholder="Etiqueta" value={newCatLabel} onChange={(e) => setNewCatLabel(e.target.value)} />
                      <input className="admin-input" style={{ width: 56, fontSize: 18 }} placeholder="🏷️" value={newCatEmoji} onChange={(e) => setNewCatEmoji(e.target.value)} />
                    </div>
                    {catError && <p style={{ fontSize: 11, color: "var(--red)", marginBottom: 6 }}>{catError}</p>}
                    <div style={{ display: "flex", gap: 6 }}>
                      <button className="admin-btn admin-btn-primary admin-btn-sm" onClick={createCategory} disabled={savingCat}>
                        {savingCat ? "Creando…" : "Crear"}
                      </button>
                      <button className="admin-btn admin-btn-ghost admin-btn-sm" onClick={() => { setShowNewCat(false); setCatError(""); }}>Cancelar</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* -- Autorrelleno IA --------------------------------------------- */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <button
              className="admin-btn admin-btn-ghost admin-btn-sm"
              onClick={autofill}
              disabled={autofilling}
              style={{ display: "flex", alignItems: "center", gap: 6 }}
            >
              {autofilling
                ? <><span className="admin-spinner" aria-hidden="true" /> Analizando…</>
                : "✦ Autorrellenar con IA"}
            </button>
            {autofillMsg && (
              <span style={{ fontSize: 11, color: autofillMsg.startsWith("✓") ? "var(--lime)" : "var(--red)", fontFamily: "var(--font-jetbrains)" }}>
                {autofillMsg}
              </span>
            )}
          </div>

          {/* -- Verificar / corregir campos --------------------------------- */}
          <label className="admin-label">Campos (corrige si el parser se equivocó)</label>

          {/* Tipo de descuento */}
          <div className="admin-form-row" style={{ marginBottom: 10 }}>
            <label className="admin-label">Tipo de descuento</label>
            <div className="admin-check-group" style={{ flexDirection: "row", gap: 16 }}>
              <label className="admin-check-row">
                <input type="radio" checked={discountType === "percent"} onChange={() => setDiscountType("percent")} />
                % Porcentaje
              </label>
              <label className="admin-check-row">
                <input type="radio" checked={discountType === "perliter"} onChange={() => setDiscountType("perliter")} />
                $/litro (bencina por app)
              </label>
            </div>
          </div>

          <div className="admin-form-grid" style={{ marginBottom: 12 }}>
            {discountType === "percent" ? (
              <div className="admin-form-row">
                <label className="admin-label">Descuento (%)</label>
                <input className="admin-input" type="number" min={1} max={100} value={discount ?? ""} onChange={(e) => setDiscount(e.target.value ? +e.target.value : null)} />
              </div>
            ) : (
              <div className="admin-form-row">
                <label className="admin-label">Descuento por litro (CLP)</label>
                <input className="admin-input" type="number" min={1} placeholder="ej. 100" value={discountPerUnit ?? ""} onChange={(e) => setDiscountPerUnit(e.target.value ? +e.target.value : null)} />
              </div>
            )}
            <div className="admin-form-row">
              <label className="admin-label">Tope (CLP)</label>
              <input className="admin-input" type="number" min={0} value={cap ?? ""} onChange={(e) => setCap(e.target.value ? +e.target.value : null)} />
            </div>
            <div className="admin-form-row">
              <label className="admin-label">Compra mínima (CLP)</label>
              <input className="admin-input" type="number" min={0} value={minPurchase ?? ""} onChange={(e) => setMinPurchase(e.target.value ? +e.target.value : null)} />
            </div>
            <div className="admin-form-row">
              <label className="admin-label">Modalidad</label>
              <select className="admin-input" value={modality} onChange={(e) => setModality(e.target.value)}>
                <option value="presencial">Presencial</option>
                <option value="online">Online</option>
                <option value="both">Ambas</option>
              </select>
            </div>
            <div className="admin-form-row">
              <label className="admin-label">Inicio vigencia</label>
              <input className="admin-input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="admin-form-row">
              <label className="admin-label">Fin vigencia</label>
              <input className="admin-input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            <div className="admin-form-row">
              <label className="admin-label">Código (opcional)</label>
              <input className="admin-input" value={codeVal} onChange={(e) => setCodeVal(e.target.value)} />
            </div>
          </div>

          {/* Tipos de tarjeta */}
          <div style={{ marginBottom: 12 }}>
            <label className="admin-label">Tipos de tarjeta</label>
            <div className="admin-check-group">
              {["credit", "debit", "prepaid"].map((t) => (
                <label key={t} className="admin-check-row">
                  <input type="checkbox" checked={cardTypes.includes(t)} onChange={() => toggleCardType(t)} />
                  {CARD_TYPE_LABEL(t)}
                </label>
              ))}
            </div>
          </div>

          {/* Tarjeta única */}
          <div style={{ marginBottom: 12, border: "1px solid var(--line)", borderRadius: 8, padding: 10, background: cardIds.length > 0 ? "rgba(212,255,58,0.04)" : "transparent" }}>
            <label className="admin-check-row" style={{ marginBottom: cardIds.length > 0 ? 10 : 0 }}>
              <input
                type="checkbox"
                checked={cardIds.length > 0}
                onChange={(e) => {
                  if (e.target.checked) {
                    const first = cards.find((c) => c.bank_id === row.bank_id);
                    setCardIds(first ? [first.id] : []);
                  } else {
                    setCardIds([]);
                  }
                }}
              />
              Solo para tarjetas específicas
              <span style={{ fontSize: 11, color: "var(--ink-dim)", fontFamily: "var(--font-jetbrains)" }}> (ignora el filtro por tipo)</span>
            </label>
            {cardIds.length > 0 && (
              <div className="admin-check-group" style={{ marginTop: 4 }}>
                {cards.filter((c) => c.bank_id === row.bank_id).map((c) => (
                  <label key={c.id} className="admin-check-row">
                    <input type="checkbox" checked={cardIds.includes(c.id)} onChange={() => toggleCardId(c.id)} />
                    {c.name}
                    <span style={{ fontSize: 10, color: "var(--ink-dim)", fontFamily: "var(--font-jetbrains)", textTransform: "uppercase" }}> {CARD_TYPE_LABEL(c.type)}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Días */}
          <div style={{ marginBottom: 12 }}>
            <label className="admin-label">Días (vacío = todos)</label>
            <div className="admin-check-group">
              {DAYS.map((d, i) => (
                <label key={i} className="admin-check-row" style={{ fontSize: 12 }}>
                  <input type="checkbox" checked={days.includes(i)} onChange={() => setDays(days.includes(i) ? days.filter((x) => x !== i) : [...days, i])} /> {d}
                </label>
              ))}
            </div>
          </div>

          {/* Apilable */}
          <label className="admin-check-row" style={{ marginBottom: 12 }}>
            <input type="checkbox" checked={stackable} onChange={(e) => setStackable(e.target.checked)} />
            Apilable <span style={{ fontSize: 11, color: "var(--ink-dim)", fontFamily: "var(--font-jetbrains)" }}>(puede combinarse con otras promos)</span>
          </label>

          {/* Condiciones editables */}
          <div className="admin-form-row" style={{ marginBottom: 12 }}>
            <label className="admin-label">Condiciones</label>
            <textarea className="admin-input" rows={2} value={conditionsText} onChange={(e) => setConditionsText(e.target.value)} />
          </div>

          {row.source_cards.length > 0 && (
            <p style={{ fontSize: 10, color: "var(--ink-dim)", marginBottom: 12, fontFamily: "var(--font-jetbrains)" }}>
              Tarjetas origen: {row.source_cards.join(", ")}
            </p>
          )}

          <div className="admin-form-actions">
            <button className="admin-btn admin-btn-primary" onClick={approve} disabled={busy || (mode === "existing" ? !merchantId : !nmCat)}>
              {busy ? "Aprobando…" : "Aprobar → producción"}
            </button>
            <a className="admin-btn admin-btn-ghost admin-btn-sm" href={row.source} target="_blank" rel="noreferrer">Ver fuente</a>
          </div>
        </div>
      )}
    </div>
  );
}