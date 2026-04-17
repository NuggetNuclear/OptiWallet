import { InnerPageLayout } from "@/components/InnerPageLayout";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cookies — OptiWallet",
  description: "Política de cookies de OptiWallet. Spoiler: no usamos cookies de seguimiento.",
};

export default function CookiesPage() {
  return (
    <InnerPageLayout>
      <section className="section" style={{ paddingTop: "140px", minHeight: "70vh" }}>
        <div className="section-label">Legal</div>
        <h2 className="section-title">
          Cookies
        </h2>
        <div style={{ maxWidth: "720px" }}>
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "10px",
            background: "rgba(212, 255, 58, 0.08)",
            border: "1px solid rgba(212, 255, 58, 0.3)",
            borderRadius: "100px",
            padding: "10px 20px",
            marginBottom: "48px",
            fontFamily: "var(--font-jetbrains), monospace",
            fontSize: "12px",
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            color: "var(--lime)",
          }}>
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--lime)", display: "inline-block" }} />
            Sin cookies de seguimiento
          </div>

          <div style={{
            background: "var(--bg-2)",
            border: "1px solid var(--line)",
            borderRadius: "24px",
            padding: "40px 48px",
            marginBottom: "24px",
          }}>
            <h3 style={{
              fontFamily: "var(--font-fraunces), serif",
              fontSize: "22px",
              fontWeight: "600",
              letterSpacing: "-0.02em",
              marginBottom: "16px",
            }}>
              No usamos cookies
            </h3>
            <p style={{ color: "var(--ink-dim)", fontSize: "15px", lineHeight: "1.7" }}>
              OptiWallet no instala ninguna cookie en tu navegador.
              No rastreamos tu navegación, no compartimos datos con anunciantes
              y no usamos cookies de sesión para identificarte.
            </p>
          </div>

          <div style={{
            background: "var(--bg-2)",
            border: "1px solid var(--line)",
            borderRadius: "24px",
            padding: "40px 48px",
          }}>
            <h3 style={{
              fontFamily: "var(--font-fraunces), serif",
              fontSize: "22px",
              fontWeight: "600",
              letterSpacing: "-0.02em",
              marginBottom: "16px",
            }}>
              ¿Y el localStorage?
            </h3>
            <p style={{ color: "var(--ink-dim)", fontSize: "15px", lineHeight: "1.7" }}>
              La app usa el <strong style={{ color: "var(--ink)" }}>localStorage</strong> de tu
              dispositivo (no cookies) para recordar qué tarjetas seleccionaste. Este dato
              nunca sale de tu teléfono o computador. Puedes borrarlo en cualquier momento
              limpiando el caché del sitio en la configuración de tu navegador. Para más
              detalle, revisa nuestra{" "}
              <Link href="/privacidad" style={{ color: "var(--lime)", textDecoration: "none" }}>
                Política de Privacidad
              </Link>.
            </p>
          </div>
        </div>
      </section>
    </InnerPageLayout>
  );
}
