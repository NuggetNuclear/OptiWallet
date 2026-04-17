import { InnerPageLayout } from "@/components/InnerPageLayout";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Prensa — OptiWallet",
  description: "Kit de prensa y contacto para medios de comunicación.",
};

export default function PrensaPage() {
  return (
    <InnerPageLayout>
      <section className="section" style={{ paddingTop: "140px", minHeight: "70vh" }}>
        <div className="section-label">Compañía</div>
        <h2 className="section-title">
          Prensa
        </h2>
        <div style={{ maxWidth: "640px", display: "flex", flexDirection: "column", gap: "24px" }}>
          <div style={{
            background: "var(--bg-2)",
            border: "1px solid var(--line)",
            borderRadius: "24px",
            padding: "40px 48px",
            display: "flex",
            flexDirection: "column",
            gap: "16px",
          }}>
            <div style={{
              fontFamily: "var(--font-fraunces), serif",
              fontSize: "22px",
              fontWeight: "600",
              letterSpacing: "-0.02em",
            }}>
              Kit de prensa en preparación
            </div>
            <p style={{ color: "var(--ink-dim)", fontSize: "15px", lineHeight: "1.65" }}>
              Estamos preparando logos, capturas de pantalla, fichas de datos y
              material de prensa. Por ahora, si eres periodista o creador de contenido
              y quieres cubrir OptiWallet, escríbenos directo.
            </p>
            <a
              href="mailto:hola@optiwallet.cl?subject=Prensa%20/%20OptiWallet"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                background: "var(--lime)",
                color: "var(--bg)",
                padding: "12px 22px",
                borderRadius: "100px",
                fontSize: "14px",
                fontWeight: "600",
                textDecoration: "none",
                width: "fit-content",
                transition: "opacity 0.2s",
              }}
            >
              hola@optiwallet.cl →
            </a>
          </div>
        </div>
      </section>
    </InnerPageLayout>
  );
}
