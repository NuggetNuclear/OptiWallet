import { InnerPageLayout } from "@/components/InnerPageLayout";
import { ComingSoon } from "@/components/ComingSoon";
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
        <h2 className="section-title">Blog</h2>
        <ComingSoon
          icon={
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
          }
          title="Próximamente"
          description="Guías sobre cómo sacarle el máximo a tus tarjetas, comparativas de beneficios bancarios y tips de finanzas personales para Chile. ¡Vuelve pronto!"
          contactLabel="¿Quieres escribir con nosotros? →"
          emailSubject="Blog / Colaboración"
        />
      </section>
    </InnerPageLayout>
  );
}
