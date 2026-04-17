"use client";

import Link from "next/link";
import { useState } from "react";
import "./landing.css";

export default function LandingPage() {
  const [openFaq, setOpenFaq] = useState<number>(0);

  const toggleFaq = (index: number) => {
    setOpenFaq(openFaq === index ? -1 : index);
  };

  const faqs = [
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
      a: "Un equipo de estudiantes de ingeniería de la UDP que estábamos cansados de pagar Jumbo los jueves con la tarjeta equivocada. Construido en Chile, para Chile.",
    },
  ];

  return (
    <div className="landing-root">
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
        <Link href="/app" className="nav-cta">Probar gratis →</Link>
      </nav>

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
            <Link href="/app" className="btn-primary">
              Agregar al inicio
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M1 8h14m0 0l-6-6m6 6l-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </Link>
            <a href="#como-funciona" className="btn-ghost">Ver cómo funciona</a>
          </div>
          <div className="hero-stats">
            <div>
              <div className="stat-num">$XXX.XXX</div>
              <div className="stat-label">Ahorro anual estimado*</div>
            </div>
            <div>
              <div className="stat-num">+250</div>
              <div className="stat-label">Promos activas hoy</div>
            </div>
            <div>
              <div className="stat-num">14</div>
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
                  <div className="greeting">viernes · 17 de abril</div>
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
          {["Banco de Chile", "Santander", "BCI", "Scotiabank", "Itaú", "BancoEstado", "Falabella", "Cencosud", "Ripley", "Security", "Consorcio", "Tenpo", "MACH", "Copec Pay",
            "Banco de Chile", "Santander", "BCI", "Scotiabank", "Itaú", "BancoEstado", "Falabella", "Cencosud", "Ripley", "Security", "Consorcio", "Tenpo", "MACH", "Copec Pay"
          ].map((bank, i) => (
            <div key={i} className="bank-chip">{bank}</div>
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
            <p className="step-text">Jumbo, Copec, Cinemark, La Polar, Sodimac, Starbucks... escribe el nombre del comercio o escanéalo con la cámara.</p>
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
            <h3>Hoy no es martes</h3>
            <p>Muchas promos dependen del día. OptiWallet sabe la fecha y solo te muestra lo vigente.</p>
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
            <div className="big-num"><em>0</em> seg</div>
            <div className="num-label">de espera. La recomendación aparece en el momento, sin sincronizaciones.</div>
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
            &quot;Antes pagaba todo con la misma tarjeta porque no sabía cuál usar. Con OptiWallet, <em>ahorré $94.000 en un mes</em> solo ordenando con qué pago el super y la bencina.&quot;
          </p>
          <div className="quote-author">
            <div className="quote-avatar"></div>
            <div>
              <div className="quote-name">— Nombre Apellido</div>
              <div className="quote-role">Usuaria beta · Providencia</div>
            </div>
          </div>
        </div>
      </section>

      {/* ============ INSTALL PWA ============ */}
      <section className="section install-section" id="instalar">
        <div className="section-label">Sin descargar nada</div>
        <h2 className="section-title">Se instala desde Safari. <em>Como una app real.</em></h2>

        <div className="install-grid">
          <div className="install-steps">
            {[
              { n: "01", title: "Abre optiwallet.cl en Safari", desc: "Desde tu iPhone o Android. No entres a la App Store." },
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
              <span className="safari-url">optiwallet.cl</span>
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
              <div style={{ marginLeft: "auto", background: "var(--lime)", color: "var(--bg)", padding: "6px 14px", borderRadius: "8px", fontSize: "12px", fontWeight: "600" }}>Añadir</div>
            </div>
            <p style={{ fontFamily: "var(--font-jetbrains), monospace", fontSize: "11px", color: "var(--ink-dim)", marginTop: "20px", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              — Funciona offline · pesa &lt; 1MB —
            </p>
          </div>
        </div>
      </section>

      {/* ============ FAQ ============ */}
      <section className="section" id="faq">
        <div className="section-label">Preguntas frecuentes</div>
        <h2 className="section-title">¿Y esto <em>cómo</em>?</h2>

        <div className="faq-list">
          {faqs.map((faq, i) => (
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
        <Link href="/app" className="btn-primary" style={{ padding: "20px 36px", fontSize: "17px", display: "inline-flex", width: "auto" }}>
          Instalar OptiWallet
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
            <path d="M1 8h14m0 0l-6-6m6 6l-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </Link>
        <p style={{ marginTop: "24px", fontFamily: "var(--font-jetbrains), monospace", fontSize: "12px", color: "var(--ink-dim)", textTransform: "uppercase", letterSpacing: "0.15em" }}>
          Gratis · Sin registro · Sin descargas
        </p>
      </section>

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
            <h5>Producto</h5>
            <a href="#como-funciona">Cómo funciona</a>
            <a href="#bancos">Bancos soportados</a>
            <a href="#instalar">Instalar</a>
            <a href="#">Roadmap</a>
          </div>
          <div className="footer-col">
            <h5>Compañía</h5>
            <a href="#">Sobre nosotros</a>
            <a href="#">Blog</a>
            <a href="#">Contacto</a>
            <a href="#">Prensa</a>
          </div>
          <div className="footer-col">
            <h5>Legal</h5>
            <a href="#">Términos de uso</a>
            <a href="#">Política de privacidad</a>
            <a href="#">Cookies</a>
          </div>
        </div>
        <div className="footer-bottom">
          <div>© 2026 OptiWallet · Hecho con ☕ en Santiago, Chile</div>
          <div>v0.1.0-beta · *Estimaciones con placeholder</div>
        </div>
      </footer>
    </div>
  );
}
