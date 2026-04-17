import { InnerPageLayout } from "@/components/InnerPageLayout";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Blog — OptiWallet",
  description: "Artículos sobre finanzas personales, tarjetas y ahorro en Chile.",
};

export default function BlogPage() {
  return (
    <InnerPageLayout>
      <section className="section" style={{ paddingTop: "140px", minHeight: "70vh" }}>
        <div className="section-label">Compañía</div>
        <h2 className="section-title">
          Blog
        </h2>
        <div style={{
          background: "var(--bg-2)",
          border: "1px solid var(--line)",
          borderRadius: "24px",
          padding: "60px 48px",
          maxWidth: "560px",
          display: "flex",
          flexDirection: "column",
          gap: "20px",
        }}>
          <div style={{
            width: "48px",
            height: "48px",
            borderRadius: "14px",
            background: "rgba(212, 255, 58, 0.1)",
            border: "1px solid rgba(212, 255, 58, 0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--lime)",
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
          </div>
          <div>
            <div style={{
              fontFamily: "var(--font-fraunces), serif",
              fontSize: "22px",
              fontWeight: "600",
              letterSpacing: "-0.02em",
              marginBottom: "10px",
            }}>
              Próximamente
            </div>
            <p style={{ color: "var(--ink-dim)", fontSize: "15px", lineHeight: "1.65" }}>
              Guías sobre cómo sacarle el máximo a tus tarjetas, comparativas de beneficios
              bancarios y tips de finanzas personales para Chile. ¡Vuelve pronto!
            </p>
          </div>
        </div>
      </section>
    </InnerPageLayout>
  );
}
