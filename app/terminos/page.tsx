import { InnerPageLayout } from "@/components/InnerPageLayout";
import { ComingSoon } from "@/components/ComingSoon";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Términos de Uso — OptiWallet",
  description: "Condiciones de uso de OptiWallet.",
};

export default function TerminosPage() {
  return (
    <InnerPageLayout>
      <section className="section" style={{ paddingTop: "140px", minHeight: "70vh" }}>
        <div className="section-label">Legal</div>
        <h2 className="section-title">Términos de uso</h2>
        <ComingSoon
          icon={
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
          }
          title="En preparación"
          description="Los términos de uso detallados están siendo redactados. Mientras tanto, el principio central es simple: OptiWallet es una herramienta de consulta de información pública. No garantizamos que todas las promociones estén vigentes en todo momento; siempre verifica con tu banco antes de pagar."
          contactLabel="¿Tienes preguntas legales? Escríbenos →"
          emailSubject="Consulta Términos"
        />
      </section>
    </InnerPageLayout>
  );
}
