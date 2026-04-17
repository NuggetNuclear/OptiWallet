import { InnerPageLayout } from "@/components/InnerPageLayout";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sobre Nosotros — OptiWallet",
  description: "Quiénes somos y por qué construimos OptiWallet.",
};

export default function SobreNosotrosPage() {
  return (
    <InnerPageLayout>
      <section className="section" style={{ paddingTop: "140px", minHeight: "70vh" }}>
        <div className="section-label">Compañía</div>
        <h2 className="section-title">
          Sobre <em>nosotros</em>
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
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
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
              Somos un equipo de estudiantes de ingeniería de la UDP cansados de pagar Jumbo
              los jueves con la tarjeta equivocada. Pronto contamos mejor la historia.
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
            Contáctanos →
          </a>
        </div>
      </section>
    </InnerPageLayout>
  );
}
