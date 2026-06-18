"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AdminShell } from "../../components/AdminShell";

interface Bank { id: string; name: string }
interface Parsed {
  bank_id?: string;
  generated_at?: string;
  edge_counts?: Record<string, number>;
  clean?: Array<Record<string, unknown>>;
}
interface ImportResult { run_id: number; total: number; imported: number; skipped: number; edge_count: number }

export default function ImportPage() {
  const router = useRouter();
  const [banks, setBanks] = useState<Bank[]>([]);
  const [raw, setRaw] = useState("");
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [bankId, setBankId] = useState("");
  const [error, setError] = useState("");
  const [parseError, setParseError] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  useEffect(() => {
    fetch("/api/admin/data/banks").then((r) => r.ok ? r.json() : []).then(setBanks);
  }, []);

  function ingest(text: string) {
    setRaw(text);
    setParseError(""); setResult(null); setError("");
    try {
      const j = JSON.parse(text);
      // Acepta el objeto combinado {bank_id, clean, edge_counts} o un array crudo de clean.
      const norm: Parsed = Array.isArray(j) ? { clean: j } : j;
      if (!Array.isArray(norm.clean)) throw new Error("No se encontró el array 'clean'");
      setParsed(norm);
      if (norm.bank_id) setBankId(norm.bank_id);
    } catch (e) {
      setParsed(null);
      setParseError(e instanceof Error ? e.message : "JSON inválido");
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    ingest(await f.text());
  }

  const clean = parsed?.clean ?? [];
  const newMerchants = clean.filter((r) => String(r.merchant_id ?? "").startsWith("NEW:")).length;
  const missingEnd = clean.filter((r) => !r.end_date).length;
  const edgeTotal = Object.values(parsed?.edge_counts ?? {}).reduce((a, n) => a + (Number(n) || 0), 0);

  async function doImport() {
    if (!parsed || !bankId) return;
    setImporting(true); setError("");
    try {
      const res = await fetch("/api/admin/ops/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bank_id: bankId, clean, edge_counts: parsed.edge_counts ?? {} }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Error al importar"); return; }
      setResult(data);
    } catch { setError("Error de red"); } finally { setImporting(false); }
  }

  return (
    <AdminShell>
      <div className="admin-header">
        <div>
          <h1 className="admin-title">Importar datos scrapeados</h1>
          <p className="admin-subtitle">Sube el JSON que genera un scraper → va a staging para revisión</p>
        </div>
        <Link href="/admin/ops" className="admin-btn admin-btn-ghost">← Operaciones</Link>
      </div>

      {error && <div className="admin-error">{error}</div>}

      {result ? (
        <div className="admin-card" style={{ marginBottom: 24 }}>
          <p className="admin-card-title">Importación completada</p>
          <div className="admin-stats" style={{ marginBottom: 16 }}>
            <div className="admin-card admin-stat"><div className="admin-stat-value" style={{ color: "var(--lime)" }}>{result.imported}</div><div className="admin-stat-label">A staging</div></div>
            <div className="admin-card admin-stat"><div className="admin-stat-value">{result.skipped}</div><div className="admin-stat-label">Duplicados omitidos</div></div>
            <div className="admin-card admin-stat"><div className="admin-stat-value">{result.edge_count}</div><div className="admin-stat-label">Casos borde</div></div>
          </div>
          <div className="admin-form-actions">
            <button className="admin-btn admin-btn-primary" onClick={() => router.push(`/admin/ops/${bankId}`)}>
              Ir a revisar ({result.imported}) →
            </button>
            <button className="admin-btn admin-btn-ghost" onClick={() => { setResult(null); setParsed(null); setRaw(""); }}>
              Importar otro
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="admin-card" style={{ marginBottom: 16 }}>
            <p className="admin-card-title">1 · Cargar archivo</p>
            <div className="admin-form-row" style={{ marginBottom: 12 }}>
              <label className="admin-label">Archivo JSON</label>
              <input className="admin-input" type="file" accept="application/json,.json" onChange={onFile} />
            </div>
            <div className="admin-form-row">
              <label className="admin-label">…o pegar JSON</label>
              <textarea
                className="admin-input"
                rows={5}
                placeholder='{ "bank_id": "banco-chile", "clean": [ … ] }'
                value={raw}
                onChange={(e) => ingest(e.target.value)}
                style={{ fontFamily: "var(--font-jetbrains)", fontSize: 12 }}
              />
            </div>
            {parseError && <div className="admin-error" style={{ marginTop: 8 }}>{parseError}</div>}
          </div>

          {parsed && (
            <div className="admin-card" style={{ marginBottom: 16 }}>
              <p className="admin-card-title">2 · Verificación previa</p>
              <div className="admin-form-row" style={{ marginBottom: 16 }}>
                <label className="admin-label">Banco destino</label>
                <select className="admin-input" style={{ maxWidth: 260 }} value={bankId} onChange={(e) => setBankId(e.target.value)}>
                  <option value="">— Seleccionar —</option>
                  {banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>

              <div className="admin-stats" style={{ marginBottom: 8 }}>
                <div className="admin-card admin-stat"><div className="admin-stat-value">{clean.length}</div><div className="admin-stat-label">Promos limpias</div></div>
                <div className="admin-card admin-stat"><div className="admin-stat-value" style={{ color: newMerchants ? "var(--lime)" : undefined }}>{newMerchants}</div><div className="admin-stat-label">Comercios nuevos</div></div>
                <div className="admin-card admin-stat"><div className="admin-stat-value">{missingEnd}</div><div className="admin-stat-label">Sin fecha término</div></div>
                <div className="admin-card admin-stat"><div className="admin-stat-value">{edgeTotal}</div><div className="admin-stat-label">Casos borde (no importan)</div></div>
              </div>
              <p style={{ fontSize: 11, color: "var(--ink-dim)", margin: 0, fontFamily: "var(--font-jetbrains)" }}>
                Los duplicados (mismo contenido ya en staging) se omiten automáticamente al importar.
              </p>
            </div>
          )}

          {parsed && (
            <div className="admin-form-actions">
              <button className="admin-btn admin-btn-primary" onClick={doImport} disabled={importing || !bankId || clean.length === 0}>
                {importing ? "Importando…" : `Importar ${clean.length} a staging`}
              </button>
            </div>
          )}
        </>
      )}
    </AdminShell>
  );
}
