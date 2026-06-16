import { InnerPageLayout } from "@/components/InnerPageLayout";
import { ComingSoon } from "@/components/ComingSoon";
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
        <h2 className="section-title">Roadmap</h2>
        <ComingSoon
          icon={
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          }
          description="Estamos documentando el plan de desarrollo. Pronto podrás ver qué viene, qué está en progreso y qué ya fue lanzado."
          contactLabel="¿Tienes ideas? Escríbenos →"
          emailSubject="Ideas para el Roadmap"
        />
      </section>
    </InnerPageLayout>
  );
}
