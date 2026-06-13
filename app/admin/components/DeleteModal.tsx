"use client";

interface Dep { id: string; name?: string }

interface DeleteModalProps {
  title: string;
  deps?: { label: string; items: Dep[] }[];
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

export function DeleteModal({ title, deps, onConfirm, onCancel, loading }: DeleteModalProps) {
  const hasDeps = deps?.some((d) => d.items.length > 0);

  return (
    <div className="admin-modal-overlay" onClick={onCancel}>
      <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ fontFamily: "var(--font-serif)", fontSize: 18, marginBottom: 16 }}>
          Eliminar {title}
        </h2>

        {hasDeps ? (
          <>
            <div className="admin-error" style={{ marginBottom: 16 }}>
              No puedes eliminar este registro mientras tenga dependencias. Elimina o reasigna los siguientes registros primero:
            </div>
            {deps!.filter((d) => d.items.length > 0).map((dep) => (
              <div key={dep.label} style={{ marginBottom: 12 }}>
                <p className="admin-label">{dep.label} ({dep.items.length})</p>
                <ul style={{ fontSize: 12, color: "var(--ink-dim)", paddingLeft: 16 }}>
                  {dep.items.slice(0, 10).map((item) => (
                    <li key={item.id}>{item.name ?? item.id}</li>
                  ))}
                  {dep.items.length > 10 && <li>…y {dep.items.length - 10} más</li>}
                </ul>
              </div>
            ))}
            <button className="admin-btn admin-btn-ghost" onClick={onCancel} style={{ marginTop: 8 }}>
              Cerrar
            </button>
          </>
        ) : (
          <>
            <p style={{ fontSize: 13, color: "var(--ink-dim)", marginBottom: 24 }}>
              Esta acción no se puede deshacer.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="admin-btn admin-btn-danger" onClick={onConfirm} disabled={loading}>
                {loading ? "Eliminando…" : "Sí, eliminar"}
              </button>
              <button className="admin-btn admin-btn-ghost" onClick={onCancel} disabled={loading}>
                Cancelar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
