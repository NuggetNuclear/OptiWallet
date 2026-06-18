import { InnerPageLayout } from "@/components/InnerPageLayout";
import { ComingSoon } from "@/components/ComingSoon";
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
        <ComingSoon
          icon={
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          }
          description="Somos un equipo de estudiantes de ingeniería de la UDP cansados de pagar Jumbo los jueves con la tarjeta equivocada. Pronto contamos mejor la historia."
          contactLabel="Contáctanos →"
          emailSubject="Contacto / Sobre Nosotros"
        />
      </section>
    </InnerPageLayout>
  );
}
