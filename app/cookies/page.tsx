import { InnerPageLayout } from "@/components/InnerPageLayout";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cookies — OptiWallet",
  description: "Política de cookies de OptiWallet. Una sola cookie técnica, cero seguimiento, analytics sin cookies.",
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
              Una sola cookie — y es técnica
            </h3>
            <p style={{ color: "var(--ink-dim)", fontSize: "15px", lineHeight: "1.7" }}>
              OptiWallet usa exactamente una cookie:{" "}
              <code style={{ color: "var(--ink)", background: "var(--bg-3)", padding: "2px 6px", borderRadius: "6px", fontSize: "13px" }}>ow_standalone</code>.
              Es una marca técnica con valor fijo (&quot;1&quot;) que se crea cuando abres la app
              instalada en tu pantalla de inicio, para llevarte directo a la app en vez de a la
              página de presentación. Dura 1 año, no contiene identificadores, no permite
              rastrearte y se elimina sola si dejas de usar la app instalada. No usamos cookies
              de seguimiento, de publicidad ni de sesión para identificarte.
            </p>
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
              ¿Y las estadísticas? Sin cookies
            </h3>
            <p style={{ color: "var(--ink-dim)", fontSize: "15px", lineHeight: "1.7" }}>
              Medimos el uso de la app con <strong style={{ color: "var(--ink)" }}>Plausible
              Analytics</strong>, que funciona <strong style={{ color: "var(--ink)" }}>sin
              cookies</strong> y sin identificadores persistentes: cuenta visitas de forma
              agregada y anónima, sin rastrearte entre sitios ni construir un perfil tuyo.
              Por eso no verás un banner de consentimiento de cookies en OptiWallet — no hay
              nada que consentir. El detalle está en la{" "}
              <Link href="/privacidad" style={{ color: "var(--lime)", textDecoration: "none" }}>
                Política de Privacidad
              </Link>.
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
