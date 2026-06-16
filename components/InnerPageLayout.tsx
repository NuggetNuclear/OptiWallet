import Link from "next/link";
import "@/app/landing.css";

export function InnerPageLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="landing-root">
      <nav>
        <Link href="/" className="logo" style={{ textDecoration: "none", color: "inherit" }}>
          <span className="logo-dot"></span>
          OptiWallet
        </Link>
        <div className="nav-links">
          <Link href="/#como-funciona">Cómo funciona</Link>
          <Link href="/#bancos">Bancos</Link>
          <Link href="/#instalar">Instalar</Link>
          <Link href="/#faq">FAQ</Link>
        </div>
        <Link href="/app" className="nav-cta">Probar gratis →</Link>
      </nav>

      <main className="inner-page-content">{children}</main>

      <footer>
        <div className="footer-inner">
          <div className="footer-col">
            <div className="footer-brand">OptiWallet</div>
            <p className="footer-tagline">
              La app que te dice con qué tarjeta pagar para ahorrar más, en cada comercio de Chile.
            </p>
          </div>
          <div className="footer-col">
            <h3>Producto</h3>
            <Link href="/#como-funciona">Cómo funciona</Link>
            <Link href="/#bancos">Bancos soportados</Link>
            <Link href="/#instalar">Instalar</Link>
            <Link href="/roadmap">Roadmap</Link>
          </div>
          <div className="footer-col">
            <h3>Compañía</h3>
            <Link href="/sobre-nosotros">Sobre nosotros</Link>
            <Link href="/blog">Blog</Link>
            <Link href="/contacto">Contacto</Link>
            <Link href="/prensa">Prensa</Link>
          </div>
          <div className="footer-col">
            <h3>Legal</h3>
            <Link href="/terminos">Términos de uso</Link>
            <Link href="/privacidad">Política de privacidad</Link>
            <Link href="/cookies">Cookies</Link>
          </div>
        </div>
        <div className="footer-bottom">
          <div>© 2026 OptiWallet · Hecho con ☕ en Santiago, Chile</div>
          <div>v1.0.0-beta.1</div>
        </div>
      </footer>
    </div>
  );
}
