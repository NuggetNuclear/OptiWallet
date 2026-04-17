import { InnerPageLayout } from "@/components/InnerPageLayout";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Roadmap — OptiWallet",
  description: "Qué viene en OptiWallet.",
};

export default function RoadmapPage() {
  return (
    <InnerPageLayout>
      <section className="section" style={{ paddingTop: "140px", minHeight: "70vh" }}>
        <div className="section-label">Producto</div>
        <h2 className="section-title">
          Roadmap
        </h2>
        <ComingSoon description="Estamos documentando el plan de desarrollo. Pronto podrás ver qué viene, qué está en progreso y qué ya fue lanzado." />
      </section>
    </InnerPageLayout>
  );
}

function ComingSoon({ description }: { description: string }) {
  return (
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
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
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
          En construcción
        </div>
        <p style={{ color: "var(--ink-dim)", fontSize: "15px", lineHeight: "1.65" }}>
          {description}
        </p>
      </div>
      <a
        href="mailto:hola@optiwallet.cl"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "8px",
          fontFamily: "var(--font-jetbrains), monospace",
          fontSize: "12px",
          textTransform: "uppercase",
          letterSpacing: "0.12em",
          color: "var(--copper)",
          textDecoration: "none",
        }}
      >
        ¿Tienes ideas? Escríbenos →
      </a>
    </div>
  );
}
