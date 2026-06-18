import { InnerPageLayout } from "@/components/InnerPageLayout";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Política de Privacidad — OptiWallet",
  description: "OptiWallet no recolecta, no almacena ni comparte datos personales. Todo funciona en tu dispositivo.",
};

const sections = [
  {
    id: "resumen",
    label: "Lo importante",
    title: "El resumen corto",
    content: (
      <>
        <p>
          OptiWallet <strong style={{ color: "var(--ink)" }}>no recolecta datos personales</strong>.
          No hay servidor que reciba tu nombre, tu RUT, tu correo ni ningún dato de identificación.
          No hay cuenta de usuario. No hay contraseña. Tu wallet vive en tu dispositivo.
        </p>
        <p style={{ marginTop: "16px" }}>
          Lo único que medimos es <strong style={{ color: "var(--ink)" }}>uso agregado y
          anónimo</strong> (estadísticas sin cookies) y <strong style={{ color: "var(--ink)" }}>errores
          técnicos</strong> cuando algo se rompe. Ninguna de las dos cosas permite identificarte.
          El detalle está más abajo.
        </p>
      </>
    ),
  },
  {
    id: "que-guardamos",
    label: "Almacenamiento local",
    title: "Lo único que guardamos — y está en tu teléfono",
    content: (
      <>
        <p>
          La app guarda en el <strong style={{ color: "var(--ink)" }}>localStorage de tu propio dispositivo</strong> una
          lista con los nombres de tus tarjetas (por ejemplo: &quot;BCI Mastercard Gold&quot;). Nada más.
        </p>
        <ul style={{ marginTop: "16px", paddingLeft: "20px", display: "flex", flexDirection: "column", gap: "10px" }}>
          {[
            "No guardamos números de tarjeta.",
            "No guardamos tu nombre ni ningún dato de identidad.",
            "No guardamos tu historial de búsquedas ni comercios consultados.",
            "No guardamos tu ubicación.",
            "Tú puedes borrar estos datos en cualquier momento vaciando el caché del navegador.",
          ].map((item) => (
            <li key={item} style={{ color: "var(--ink-dim)", fontSize: "15px", lineHeight: "1.6" }}>
              <span style={{ color: "var(--lime)", marginRight: "8px" }}>—</span>{item}
            </li>
          ))}
        </ul>
      </>
    ),
  },
  {
    id: "analytics",
    label: "Estadísticas",
    title: "Medimos uso, no personas",
    content: (
      <>
        <p>
          Usamos <strong style={{ color: "var(--ink)" }}>Plausible Analytics</strong>, una
          herramienta de estadísticas <strong style={{ color: "var(--ink)" }}>sin cookies y
          sin identificadores persistentes</strong>, para entender de forma agregada cómo se
          usa la app durante la beta: cuántas visitas hay, qué páginas se ven y cuántas
          personas completan el armado de su wallet.
        </p>
        <ul style={{ marginTop: "16px", paddingLeft: "20px", display: "flex", flexDirection: "column", gap: "10px" }}>
          {[
            "Plausible no usa cookies ni rastrea entre sitios.",
            "No permite identificarte ni reconstruir tu navegación individual.",
            "Tu dirección IP no se almacena: se usa solo de forma transitoria y anonimizada para contar visitantes únicos del día.",
            "Los eventos que medimos son acciones de producto (ej.: \"completó el onboarding\"), nunca el contenido de tu wallet asociado a ti.",
          ].map((item) => (
            <li key={item} style={{ color: "var(--ink-dim)", fontSize: "15px", lineHeight: "1.6" }}>
              <span style={{ color: "var(--lime)", marginRight: "8px" }}>—</span>{item}
            </li>
          ))}
        </ul>
      </>
    ),
  },
  {
    id: "errores",
    label: "Reporte de errores",
    title: "Si algo se rompe, lo registramos",
    content: (
      <p>
        Para mantener la app funcionando usamos <strong style={{ color: "var(--ink)" }}>Sentry</strong>,
        un servicio de monitoreo de errores. Cuando ocurre una falla técnica se envía un reporte
        con el detalle del error (qué se rompió, en qué página, tipo de navegador). Configuramos
        Sentry explícitamente para <strong style={{ color: "var(--ink)" }}>no enviar datos
        personales</strong>: sin dirección IP, sin cookies, sin identificadores de usuario.
        El contenido de tu wallet nunca viaja en estos reportes.
      </p>
    ),
  },
  {
    id: "terceros",
    label: "Terceros",
    title: "Terceros: solo dos, y sin tus datos",
    content: (
      <p>
        Los únicos servicios externos que integra OptiWallet son los dos de arriba:
        Plausible (estadísticas agregadas) y Sentry (errores técnicos). No usamos Google
        Analytics, Meta Pixel, Hotjar ni ninguna herramienta de perfilamiento de usuarios.
        No hay SDKs de redes sociales, no hay píxeles de publicidad, no hay rastreadores
        de sesión. Incluso las fuentes tipográficas se sirven desde nuestro propio dominio
        — tu navegador no contacta la CDN de Google Fonts al usar la app.
      </p>
    ),
  },
  {
    id: "cookies",
    label: "Cookies",
    title: "Una sola cookie, y es técnica",
    content: (
      <p>
        No usamos cookies para rastrearte, perfilarte ni mostrarte publicidad. La única
        cookie que existe es <code style={{ color: "var(--ink)" }}>ow_standalone</code>:
        una marca técnica (valor fijo &quot;1&quot;, sin identificadores) que recuerda que
        instalaste la app para llevarte directo a ella en vez de a la página de inicio.
        El detalle completo está en la{" "}
        <a href="/cookies" style={{ color: "var(--lime)", textDecoration: "none" }}>política de cookies</a>.
      </p>
    ),
  },
  {
    id: "promociones",
    label: "Datos de promociones",
    title: "Los datos de promos son públicos",
    content: (
      <p>
        La base de datos de promociones que usa OptiWallet proviene de fuentes públicas:
        sitios web oficiales de bancos, aplicaciones móviles de cada institución y comunicados
        de prensa. No obtenemos esta información de fuentes privadas ni de datos de transacciones
        de usuarios.
      </p>
    ),
  },
  {
    id: "menores",
    label: "Menores de edad",
    title: "Menores de edad",
    content: (
      <p>
        OptiWallet no está dirigida a menores de 14 años. No recolectamos ni solicitamos
        información de menores. Si eres padre o tutor y crees que tu hijo ha usado la app,
        no hay datos personales que eliminar; pero puedes escribirnos igual si tienes dudas.
      </p>
    ),
  },
  {
    id: "cambios",
    label: "Cambios",
    title: "Cambios a esta política",
    content: (
      <p>
        Si en el futuro OptiWallet evoluciona e incorpora funciones que requieran recolectar
        algún tipo de dato, actualizaremos esta política antes de implementarlas y
        lo comunicaremos de forma explícita. La fecha de última actualización siempre
        estará visible al final de esta página.
      </p>
    ),
  },
];

export default function PrivacidadPage() {
  return (
    <InnerPageLayout>
      <section className="section" style={{ paddingTop: "140px" }}>
        <div className="section-label">Legal</div>
        <h2 className="section-title">
          Política de <em>Privacidad</em>
        </h2>

        {/* Zero-collection badge */}
        <div style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "10px",
          background: "rgba(212, 255, 58, 0.08)",
          border: "1px solid rgba(212, 255, 58, 0.3)",
          borderRadius: "100px",
          padding: "10px 20px",
          marginBottom: "64px",
          fontFamily: "var(--font-jetbrains), monospace",
          fontSize: "12px",
          textTransform: "uppercase",
          letterSpacing: "0.12em",
          color: "var(--lime)",
        }}>
          <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--lime)", display: "inline-block" }} />
          Cero recolección de datos personales
        </div>

        <div style={{ maxWidth: "820px" }}>
          {sections.map((s, i) => (
            <div
              key={s.id}
              id={s.id}
              className="flex flex-col md:grid md:grid-cols-[220px_1fr]"
              style={{
                borderTop: "1px solid var(--line)",
                paddingTop: "48px",
                paddingBottom: "48px",
                gap: "40px",
              }}
            >
              <div>
                <div style={{
                  fontFamily: "var(--font-jetbrains), monospace",
                  fontSize: "10px",
                  textTransform: "uppercase",
                  letterSpacing: "0.2em",
                  color: "var(--ink-dim)",
                  marginBottom: "8px",
                }}>
                  {String(i + 1).padStart(2, "0")}
                </div>
                <div style={{
                  fontFamily: "var(--font-jetbrains), monospace",
                  fontSize: "11px",
                  textTransform: "uppercase",
                  letterSpacing: "0.15em",
                  color: "var(--copper)",
                }}>
                  {s.label}
                </div>
              </div>
              <div>
                <h3 style={{
                  fontFamily: "var(--font-fraunces), serif",
                  fontSize: "22px",
                  fontWeight: "600",
                  letterSpacing: "-0.02em",
                  marginBottom: "16px",
                }}>
                  {s.title}
                </h3>
                <div style={{ color: "var(--ink-dim)", fontSize: "15px", lineHeight: "1.7" }}>
                  {s.content}
                </div>
              </div>
            </div>
          ))}

          <div style={{
            borderTop: "1px solid var(--line)",
            paddingTop: "32px",
            fontFamily: "var(--font-jetbrains), monospace",
            fontSize: "12px",
            color: "var(--ink-dim)",
            display: "flex",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "12px",
          }}>
            <span>Última actualización: junio 2026</span>
            <a
              href="mailto:hola@optiwallet.cl?subject=Consulta%20Privacidad"
              style={{ color: "var(--lime)", textDecoration: "none" }}
            >
              hola@optiwallet.cl
            </a>
          </div>
        </div>
      </section>
    </InnerPageLayout>
  );
}
