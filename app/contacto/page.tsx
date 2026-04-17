import { InnerPageLayout } from "@/components/InnerPageLayout";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contacto — OptiWallet",
  description: "Escríbenos para consultas, reportes de promos o feedback sobre OptiWallet.",
};

export default function ContactoPage() {
  return (
    <InnerPageLayout>
      <section className="section" style={{ paddingTop: "140px", minHeight: "70vh" }}>
        <div className="section-label">Hablemos</div>
        <h2 className="section-title">
          Contáctanos
        </h2>

        <div style={{ maxWidth: "680px" }}>
          <p style={{ fontSize: "18px", color: "var(--ink-dim)", lineHeight: "1.7", marginBottom: "48px" }}>
            ¿Tienes una pregunta, encontraste una promo caducada, quieres proponer un banco nuevo,
            o simplemente quieres saludar? Escríbenos directo.
          </p>

          <div style={{
            background: "var(--bg-2)",
            border: "1px solid var(--line)",
            borderRadius: "24px",
            padding: "40px",
            marginBottom: "32px",
          }}>
            <div style={{
              fontFamily: "var(--font-jetbrains), monospace",
              fontSize: "11px",
              textTransform: "uppercase",
              letterSpacing: "0.2em",
              color: "var(--copper)",
              marginBottom: "16px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}>
              <span style={{ width: "20px", height: "1px", background: "var(--copper)", display: "inline-block" }} />
              Email principal
            </div>
            <a
              href="mailto:hola@optiwallet.cl"
              style={{
                fontFamily: "var(--font-fraunces), serif",
                fontSize: "clamp(28px, 4vw, 44px)",
                fontWeight: "600",
                letterSpacing: "-0.02em",
                color: "var(--lime)",
                textDecoration: "none",
                display: "block",
                marginBottom: "16px",
                transition: "opacity 0.2s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.75")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
            >
              hola@optiwallet.cl
            </a>
            <p style={{ fontSize: "14px", color: "var(--ink-dim)", lineHeight: "1.6" }}>
              Respondemos en menos de 48 horas hábiles. Si encontraste una promo caducada,
              incluye el nombre del banco y comercio en el asunto.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            {[
              { label: "Reportar promo caducada", subject: "Promo caducada: [banco] - [comercio]" },
              { label: "Proponer una promo nueva", subject: "Nueva promo: [banco] - [comercio]" },
              { label: "Feedback sobre la app", subject: "Feedback OptiWallet" },
              { label: "Propuesta de prensa", subject: "Prensa / OptiWallet" },
            ].map(({ label, subject }) => (
              <a
                key={label}
                href={`mailto:hola@optiwallet.cl?subject=${encodeURIComponent(subject)}`}
                style={{
                  background: "var(--bg-2)",
                  border: "1px solid var(--line)",
                  borderRadius: "16px",
                  padding: "20px 22px",
                  color: "var(--ink)",
                  textDecoration: "none",
                  fontSize: "14px",
                  fontWeight: "500",
                  transition: "border-color 0.2s, color 0.2s",
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "var(--lime)";
                  e.currentTarget.style.color = "var(--lime)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "rgba(245, 241, 232, 0.12)";
                  e.currentTarget.style.color = "var(--ink)";
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
                {label}
              </a>
            ))}
          </div>
        </div>
      </section>
    </InnerPageLayout>
  );
}
