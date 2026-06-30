import { InnerPageLayout } from "@/components/InnerPageLayout";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Roadmap — OptiWallet",
  description: "Qué ya lanzamos, qué estamos construyendo y qué viene en OptiWallet.",
};

// Roadmap real. Mantener sincronizado con TODO.md y los sprints:
// al cerrar algo, muévelo de "next"/"progress" a "done".
type State = "done" | "progress" | "next";

const GROUPS: Array<{
  state: State;
  status: string;
  title: string;
  items: Array<{ title: string; desc: string }>;
}> = [
  {
    state: "done",
    status: "Lanzado",
    title: "Lo que ya funciona",
    items: [
      {
        title: "Motor de recomendaciones",
        desc: "Te decimos con qué tarjeta pagar en cada comercio, ordenado por un score que pondera descuento, popularidad, frescura y urgencia.",
      },
      {
        title: "Mi wallet + onboarding",
        desc: "Eliges tus tarjetas una vez y quedan guardadas en tu dispositivo. Sin cuenta, sin contraseñas.",
      },
      {
        title: "Explorar por categoría",
        desc: "La pantalla principal agrupa las ofertas del día por categoría para que no te abrume una lista infinita.",
      },
      {
        title: "App instalable (PWA)",
        desc: "Instálala desde el navegador y úsala como app nativa, incluso sin conexión.",
      },
    ],
  },
  {
    state: "progress",
    status: "En progreso",
    title: "Lo que estamos construyendo",
    items: [
      {
        title: "Ranking con tráfico real",
        desc: "Estamos incorporando las vistas y taps reales (promo_events) al score, para priorizar las promos que de verdad le sirven a la gente.",
      },
      {
        title: "Más bancos y tarjetas",
        desc: "Ampliando la cobertura más allá de los bancos del lanzamiento, con scrapers que mantienen las promos al día.",
      },
    ],
  },
  {
    state: "next",
    status: "Próximamente",
    title: "Lo que viene",
    items: [
      {
        title: "Favoritos y alertas",
        desc: "Marca tus comercios favoritos y recibe un aviso cuando aparezca una promo nueva para tus tarjetas.",
      },
      {
        title: "Historial de ahorro",
        desc: "Lleva la cuenta de cuánto has ahorrado usando la tarjeta correcta en cada compra.",
      },
    ],
  },
];

export default function RoadmapPage() {
  return (
    <InnerPageLayout>
      <section className="section" style={{ paddingTop: "140px", minHeight: "70vh" }}>
        <div className="section-label">Producto</div>
        <h2 className="section-title">
          Roadmap
        </h2>
        <p className="roadmap-intro">
          Construimos OptiWallet a la vista de todos. Esto es lo que ya está
          disponible, lo que estamos desarrollando ahora y lo que tenemos
          planeado a continuación.
        </p>

        <div className="roadmap-groups">
          {GROUPS.map((group) => (
            <div key={group.status}>
              <div className="roadmap-group-head">
                <span className="roadmap-status" data-state={group.state}>
                  {group.status}
                </span>
                <span className="roadmap-group-title">{group.title}</span>
              </div>
              <ul className="roadmap-list">
                {group.items.map((item) => (
                  <li key={item.title} className="roadmap-item">
                    <div className="roadmap-item-title">{item.title}</div>
                    <div className="roadmap-item-desc">{item.desc}</div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <p className="roadmap-note">
          ¿Tienes una idea o echas algo de menos?{" "}
          <a href="mailto:hola@optiwallet.cl?subject=Ideas%20para%20el%20Roadmap">
            Escríbenos →
          </a>
        </p>
      </section>
    </InnerPageLayout>
  );
}
