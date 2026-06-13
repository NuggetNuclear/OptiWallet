"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePageTransition } from "@/components/PageTransition";
import { StandaloneRedirect } from "@/components/StandaloneRedirect";
import { InstallModal } from "@/components/InstallModal";
import { events } from "@/lib/analytics";
import { formatDate } from "@/lib/format";
import "./landing.css";

const FAQS = [
  {
    q: "¿Es realmente gratis?",
    a: "Sí. Durante la beta es 100% gratuita. A futuro evaluaremos un plan Premium opcional con alertas geolocalizadas y comparador de cuotas, pero la funcionalidad core siempre será gratis.",
  },
  {
    q: "¿Necesito conectar mi cuenta bancaria?",
    a: "No. Jamás. Solo nos dices qué tarjetas tienes (Banco X, producto Y). No pedimos número, clave, RUT ni acceso a tu banca en línea. La app funciona sin leer un solo peso de tu cuenta.",
  },
  {
    q: "¿De dónde sacan las promos?",
    a: "De los canales oficiales de cada banco y emisor: sitios web, apps oficiales, newsletters y comunicados. Nuestro equipo actualiza la base diariamente y verifica la vigencia de cada promoción antes de publicarla.",
  },
  {
    q: "¿Funciona fuera de Chile?",
    a: "Hoy no. OptiWallet está diseñada exclusivamente para el ecosistema financiero chileno. Queremos hacer esto muy bien en un mercado antes de pensar en otros países.",
  },
  {
    q: "¿Qué pasa si una promo ya no está vigente?",
    a: "Tenemos un sistema de reporte en cada recomendación. Si ves una promo caducada, nos avisas con un toque y la bajamos en minutos. También puedes proponer promos nuevas que encuentres.",
  },
  {
    q: "¿Quién está detrás de OptiWallet?",
    a: "Un grupo de estudiantes de ingeniería de la UDP, construido como proyecto, diseñado para ahorrar al MAXImo",
  },
];

const DAY_NAMES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

export default function LandingPage() {
  const [openFaq, setOpenFaq] = useState<number>(0);
  const { trigger, overlay } = usePageTransition();

  // Dynamic date for the phone mockup.
  const todayFormatted = useMemo(() => {
    return formatDate(new Date()).toLowerCase();
  }, []);

  // "Hoy no es: X" — rota cada 2s por los 6 días que NO son hoy,
  // partiendo desde mañana y siguiendo el orden de la semana.
  const notTodayDays = useMemo(() => {
    const today = new Date().getDay();
    return Array.from({ length: 6 }, (_, k) => DAY_NAMES[(today + 1 + k) % 7]);
  }, []);
  const [notTodayIdx, setNotTodayIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setNotTodayIdx((prev) => (prev + 1) % 6);
    }, 2000);
    return () => clearInterval(id);
  }, []);

  const toggleFaq = (index: number) => {
    setOpenFaq((prev) => (prev === index ? -1 : index));
  };

  const [stats, setStats] = useState<{ promotions: string; merchants: string; banks: string } | null>(null);
  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then(setStats)
      .catch((err) => {
        console.warn("[OptiWallet] Error al cargar stats:", err);
      });
  }, []);

  const handleAppNavigate = (e: React.MouseEvent, cta: string) => {
    e.preventDefault();
    events.ctaClick(cta);
    trigger("/app");
  };

  // Modal de instalación (Sprint 2): popup in-page con instrucciones
  // Android/iOS en vez de mandar al usuario directo a /app.
  const [installModalOpen, setInstallModalOpen] = useState(false);
  const openInstallModal = (e: React.MouseEvent, source: string) => {
    e.preventDefault();
    events.installModalOpened(source);
    setInstallModalOpen(true);
  };

  return (
    <div className="landing-root">
      {/* PWA standalone → /app (fallback client-side; el server-side vive en proxy.ts) */}
      <StandaloneRedirect />
      {overlay}
      <InstallModal open={installModalOpen} onClose={() => setInstallModalOpen(false)} />

      {/* ============ NAV ============ */}
      <nav>
        <div className="logo">
          <span className="logo-dot"></span>
          OptiWallet
        </div>
        <div className="nav-links">
          <a href="#como-funciona">Cómo funciona</a>
          <a href="#bancos">Bancos</a>
          <a href="#instalar">Instalar</a>
          <a href="#faq">FAQ</a>
        </div>
        <a href="/app" onClick={(e) => handleAppNavigate(e, "nav")} className="nav-cta" data-id="nav-cta">
          Entrar a la app →
        </a>
      </nav>

      {/* <main>: landmark requerido por a11y (landmark-one-main) */}
      <main>

        {/* ============ HERO ============ */}
        <section className="hero">
          <div className="hero-text">
            <div className="eyebrow">Beta · Solo para Chile 🇨🇱</div>
            <h1>
              Nunca más pagues<br />
              <span className="strike">de más.</span><br />
              <em>Paga con la tarjeta correcta.</em>
            </h1>
            <p className="hero-sub">
              OptiWallet cruza <strong style={{ color: "var(--ink)" }}>todas</strong> las promociones y
              descuentos de bancos y tarjetas de crédito en Chile, y te dice exactamente con cuál pagar,
              según el día y el comercio. Sin saldos. Sin clave. Solo recomendaciones.
            </p>
            <div className="hero-ctas">
              <button onClick={(e) => openInstallModal(e, "hero")} className="btn-primary" data-id="hero-cta">
                Agregar al inicio
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M8 1v10m0 0L4 7m4 4l4-4M2 14h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <a href="#como-funciona" className="btn-ghost">Ver cómo funciona</a>
            </div>
            <div className="hero-stats">
              <div>
                <div className="stat-num">{stats ? stats.promotions : "—"}</div>
                <div className="stat-label">Promos activas rastreadas</div>
              </div>
              <div>
                <div className="stat-num">{stats ? stats.merchants : "—"}</div>
                <div className="stat-label">Comercios cubiertos</div>
              </div>
              <div>
                <div className="stat-num">{stats ? stats.banks : "—"}</div>
                <div className="stat-label">Bancos integrados</div>
              </div>
            </div>
          </div>

          <div className="phone-wrap">
            <div className="phone">
              <div className="phone-notch"></div>
              <div className="phone-screen">
                <div className="app-header">
                  <div>
                    <div className="greeting" suppressHydrationWarning>{todayFormatted}</div>
                    <div className="greeting-name">Hola, Gabriel</div>
                  </div>
                  <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: "rgba(212,255,58,0.15)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--lime)", fontWeight: "700", fontFamily: "var(--font-fraunces), serif" }}>G</div>
                </div>

                <div className="search-bar">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                  </svg>
                  <span>Jumbo Costanera Center</span>
                </div>

                <div className="alt-title">Mejor opción hoy</div>

                <div className="recommendation-card">
                  <div className="rec-label">Paga con</div>
                  <div className="rec-merchant">Scotiabank</div>
                  <div className="rec-card-name">Mastercard Black · crédito</div>
                  <div className="rec-discount">25%</div>
                  <div className="rec-savings">Ahorras ~$12.500 en $50.000</div>
                </div>

                <div className="alt-title">Otras opciones</div>

                <div className="alt-card">
                  <div className="alt-card-info">
                    BancoEstado Visa
                    <small>Crédito · solo sábados</small>
                  </div>
                  <div className="alt-card-percent">15%</div>
                </div>

                <div className="alt-card">
                  <div className="alt-card-info">
                    Tarjeta Cencosud
                    <small>Promo Jumbo · martes</small>
                  </div>
                  <div className="alt-card-percent">10%</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ============ MARQUEE ============ */}
        <section className="marquee-section" id="bancos">
          <div className="marquee-label">— Cubrimos todos los bancos y tarjetas del mercado chileno —</div>
          <div className="marquee">
            {["Banco de Chile", "Santander", "BCI", "Scotiabank", "Itaú", "BancoEstado", "Falabella", "Cencosud", "Ripley", "Security", "Tenpo", "MACH", "Copec Pay",
              "Banco de Chile", "Santander", "BCI", "Scotiabank", "Itaú", "BancoEstado", "Falabella", "Cencosud", "Ripley", "Security", "Tenpo", "MACH", "Copec Pay"
            ].map((bank, i) => (
              <div key={`${bank}-${i}`} className="bank-chip">{bank}</div>
            ))}
          </div>
        </section>

        {/* ============ HOW IT WORKS ============ */}
        <section className="section" id="como-funciona">
          <div className="section-label">Cómo funciona</div>
          <h2 className="section-title">Tres pasos. <em>Un segundo.</em> Cero vueltas.</h2>

          <div className="steps">
            <div className="step">
              <div className="step-num">01</div>
              <h3 className="step-title">Registra tus tarjetas</h3>
              <p className="step-text">Marca las tarjetas que tienes (solo el nombre, nunca el número). Nosotros ya sabemos qué promos aplican a cada una.</p>
            </div>
            <div className="step">
              <div className="step-num">02</div>
              <h3 className="step-title">Busca el comercio</h3>
              <p className="step-text">Jumbo, Copec, Cinemark, La Polar, Sodimac, Starbucks... escribe el nombre del comercio y listo.</p>
            </div>
            <div className="step">
              <div className="step-num">03</div>
              <h3 className="step-title">Paga con la ganadora</h3>
              <p className="step-text">Te mostramos la tarjeta con el mejor descuento <strong style={{ color: "var(--ink)" }}>hoy</strong>, cuánto ahorras, y las alternativas. Tú solo pagas.</p>
            </div>
          </div>
        </section>

        {/* ============ FEATURES BENTO ============ */}
        <section className="section">
          <div className="section-label">Por qué OptiWallet</div>
          <h2 className="section-title">Las promos existen. <em>Encuéntralas.</em></h2>

          <div className="bento">
            <div className="feature feature-big">
              <div className="feature-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
              </div>
              <h3>Comparamos <em>todas</em> las tarjetas, en tiempo real, por ti.</h3>
              <p>Cada día salen nuevas promos: 25% los martes en supermercados, 2x1 en cines los miércoles, cashback en farmacias. Nadie lleva la cuenta. Nosotros sí.</p>
              <div className="visual-decoration">
                <div className="mini-comparison">
                  <div className="mini-row best">
                    <div className="mini-name">🏆 BCI Mastercard Gold</div>
                    <div className="mini-pct">30%</div>
                  </div>
                  <div className="mini-row">
                    <div className="mini-name">Santander Visa</div>
                    <div className="mini-pct">15%</div>
                  </div>
                  <div className="mini-row">
                    <div className="mini-name">Falabella CMR</div>
                    <div className="mini-pct">10%</div>
                  </div>
                  <div className="mini-row">
                    <div className="mini-name">Itaú Black</div>
                    <div className="mini-pct">5%</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="feature">
              <div className="feature-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
                </svg>
              </div>
              <h3 suppressHydrationWarning>
                Hoy no es:<br />
                <em className="rotating-day">{notTodayDays[notTodayIdx]}</em>
              </h3>
              <p>Muchas promos dependen del día de la semana. OptiWallet filtra automáticamente y solo te muestra lo vigente hoy.</p>
            </div>

            <div className="feature">
              <div className="feature-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
              </div>
              <h3>Favoritos cerca tuyo</h3>
              <p>Marca los comercios que visitas seguido y recibe alertas cuando haya una promo imperdible.</p>
              <p style={{ marginTop: "10px", fontFamily: "var(--font-jetbrains), monospace", fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.15em", color: "var(--copper)" }}>Próximamente</p>
            </div>

            <div className="feature">
              <div className="feature-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
              <h3>Cero datos sensibles</h3>
              <p>No pedimos números de tarjeta, clave ni acceso bancario. Solo el banco y el tipo de tarjeta.</p>
            </div>

            <div className="feature">
              <div className="feature-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 3v18h18" /><path d="M7 14l4-4 4 4 5-5" />
                </svg>
              </div>
              <h3>Historial de ahorro</h3>
              <p>Mira cuánto llevas ahorrado en el mes, el año, y qué tarjeta es tu caballo ganador.</p>
              <p style={{ marginTop: "10px", fontFamily: "var(--font-jetbrains), monospace", fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.15em", color: "var(--copper)" }}>Próximamente</p>
            </div>
          </div>
        </section>

        {/* ============ NUMBERS STRIP ============ */}
        <section className="section-intro">
          <div className="numbers-grid">
            <div className="number-cell">
              <div className="big-num">+<em>40%</em></div>
              <div className="num-label">de los chilenos tiene más de 2 tarjetas de crédito, pero solo usa <strong>una</strong>.</div>
            </div>
            <div className="number-cell">
              <div className="big-num"><em>$180k</em></div>
              <div className="num-label">es el ahorro promedio anual que proyectamos para un usuario activo de OptiWallet.*</div>
            </div>
            <div className="number-cell">
              <div className="big-num"><em>~1</em> seg</div>
              <div className="num-label">de espera. La recomendación aparece casi al instante, sin sincronizaciones.</div>
            </div>
            <div className="number-cell">
              <div className="big-num"><em>14</em></div>
              <div className="num-label">bancos y emisores de tarjetas cubiertos al lanzamiento. Sumamos más cada semana.</div>
            </div>
          </div>
        </section>

        {/* ============ QUOTE ============ */}
        <section className="quote-section">
          <div className="quote-inner">
            <p className="quote-text">
              &quot;Antes pagaba todo con la misma tarjeta porque no sabía cuál usar. Con OptiWallet, <em>ahorré $50.000 en un mes</em> solo ordenando con qué pago los cafés y la bencina.&quot;
            </p>
            <div className="quote-author">
              <div className="quote-avatar"></div>
              <div>
                <div className="quote-name"> Beta tester anónimo</div>
                <div className="quote-role">Santiago</div>
              </div>
            </div>
          </div>
        </section>

        {/* ============ INSTALL PWA ============ */}
        <section className="section install-section" id="instalar">
          <div className="section-label">Sin descargar nada</div>
          <h2 className="section-title">Se instala desde el navegador. <em>Como una app real.</em></h2>

          <div className="install-grid">
            <div className="install-steps">
              {[
                { n: "01", title: "Abre optiwallet.vercel.app en tu navegador", desc: "Safari en iPhone, Chrome en Android. No entres a la App Store." },
                { n: "02", title: "Toca el botón Compartir", desc: "El ícono del cuadrado con la flecha hacia arriba, abajo al centro." },
                { n: "03", title: "\"Añadir a pantalla de inicio\"", desc: "Aparece como una app normal. Ícono, pantalla completa, todo." },
                { n: "04", title: "Listo. Abre y arma tu wallet.", desc: "Marcas tus tarjetas en 30 segundos y ya está funcionando." },
              ].map((step) => (
                <div key={step.n} className="install-step">
                  <div className="install-step-num">{step.n}</div>
                  <div>
                    <div className="install-step-title">{step.title}</div>
                    <div className="install-step-desc">{step.desc}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="install-visual">
              <div className="safari-mockup">
                <span className="safari-url">optiwallet.vercel.app</span>
                <span className="share-icon">↑</span>
              </div>
              <div style={{ background: "var(--bg)", border: "1px solid var(--line)", borderRadius: "12px", padding: "24px", color: "var(--ink)", display: "flex", alignItems: "center", gap: "16px" }}>
                <div style={{ width: "56px", height: "56px", borderRadius: "14px", background: "var(--lime)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontFamily: "var(--font-fraunces), serif", color: "var(--bg)", fontWeight: "900", fontSize: "24px" }}>O</span>
                </div>
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontWeight: "600", fontSize: "15px" }}>OptiWallet</div>
                  <div style={{ fontSize: "12px", color: "var(--ink-dim)" }}>Añadir a pantalla de inicio</div>
                </div>
                <button
                  onClick={(e) => openInstallModal(e, "install-visual")}
                  data-id="install-visual-cta"
                  style={{ marginLeft: "auto", background: "var(--lime)", color: "var(--bg)", padding: "6px 14px", borderRadius: "8px", fontSize: "12px", fontWeight: "600", border: "none", cursor: "pointer", fontFamily: "inherit" }}
                >
                  Añadir
                </button>
              </div>
              <p style={{ fontFamily: "var(--font-jetbrains), monospace", fontSize: "11px", color: "var(--ink-dim)", marginTop: "20px", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                — Sin App Store · directo desde el navegador —
              </p>
            </div>
          </div>
        </section>

        {/* ============ FAQ ============ */}
        <section className="section" id="faq">
          <div className="section-label">Preguntas frecuentes</div>
          <h2 className="section-title">¿Y esto <em>cómo</em>?</h2>

          <div className="faq-list">
            {FAQS.map((faq, i) => (
              <div
                key={i}
                className={`faq-item${openFaq === i ? " open" : ""}`}
                onClick={() => toggleFaq(i)}
              >
                <div className="faq-q">{faq.q}</div>
                <div className="faq-a">{faq.a}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ============ FINAL CTA ============ */}
        <section className="final-cta">
          <h2>Deja de pagar<br /><em>por pagar mal.</em></h2>
          <button
            onClick={(e) => openInstallModal(e, "final")}
            className="btn-primary"
            style={{ padding: "20px 36px", fontSize: "17px", display: "inline-flex", width: "auto" }}
            data-id="final-cta"
          >
            Instalar OptiWallet
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
              <path d="M8 1v10m0 0L4 7m4 4l4-4M2 14h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <p style={{ marginTop: "24px", fontFamily: "var(--font-jetbrains), monospace", fontSize: "12px", color: "var(--ink-dim)", textTransform: "uppercase", letterSpacing: "0.15em" }}>
            Gratis · Sin registro · Sin descargas
          </p>
        </section>

      </main>

      {/* ============ FOOTER ============ */}
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
            <a href="#como-funciona">Cómo funciona</a>
            <a href="#bancos">Bancos soportados</a>
            <a href="#instalar">Instalar</a>
            <Link href="/roadmap">Roadmap <span style={{ fontSize: '9px', opacity: 0.6 }}>(pronto)</span></Link>
          </div>
          <div className="footer-col">
            <h3>Compañía</h3>
            <Link href="/sobre-nosotros">Sobre nosotros <span style={{ fontSize: '9px', opacity: 0.6 }}>(pronto)</span></Link>
            <Link href="/blog">Blog <span style={{ fontSize: '9px', opacity: 0.6 }}>(pronto)</span></Link>
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
          <div>v0.1.0-beta</div>
        </div>
      </footer>
    </div>
  );
}
