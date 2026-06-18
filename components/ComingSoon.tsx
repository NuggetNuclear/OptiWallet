interface ComingSoonProps {
  /** SVG icon content (the inner paths/shapes — wrapped in a standard icon container) */
  icon: React.ReactNode;
  /** Title shown inside the card, e.g. "En construcción" */
  title?: string;
  /** Description text */
  description: string;
  /** Email subject for the contact link */
  emailSubject?: string;
  /** Label for the contact link */
  contactLabel?: string;
}

export function ComingSoon({
  icon,
  title = "En construcción",
  description,
  emailSubject = "Consulta",
  contactLabel = "¿Tienes preguntas? Escríbenos →",
}: ComingSoonProps) {
  return (
    <div className="coming-soon-card">
      <div className="coming-soon-icon">{icon}</div>
      <div>
        <div className="coming-soon-title">{title}</div>
        <p className="coming-soon-desc">{description}</p>
      </div>
      <a
        href={`mailto:hola@optiwallet.cl?subject=${encodeURIComponent(emailSubject)}`}
        className="coming-soon-link"
      >
        {contactLabel}
      </a>
    </div>
  );
}
