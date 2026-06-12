// app/layout.tsx
// CAMBIO Sprint 2: ServiceWorkerRegistrar (PWA) + Plausible analytics (US-ANA).

import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Fraunces, Sora, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";
import { StandaloneCookieSync } from "@/components/StandaloneCookieSync";

// Plausible (US-ANA): analytics cookieless y agregado — sin banner de consentimiento.
// Sin la env var el script no se inyecta (dev y forks quedan limpios).
const PLAUSIBLE_DOMAIN = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;

const sora = Sora({
  subsets: ["latin"],
  variable: "--font-sora",
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  weight: ["300", "400", "600", "700", "900"],
  style: ["normal", "italic"],
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  weight: ["400", "500", "700"],
  display: "swap",
  // Solo se usa en labels chicos: no compite por ancho de banda crítico
  // con el CSS/HTML inicial (mejora LCP). Sora y Fraunces sí se precargan.
  preload: false,
});

export const metadata: Metadata = {
  metadataBase: new URL("https://optiwallet.vercel.app"),
  title: "OptiWallet — Paga con la tarjeta correcta",
  description:
    "Te decimos con qué tarjeta pagar para ahorrar más en cada comercio de Chile. Sin datos bancarios, sin registro obligatorio.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "OptiWallet",
    statusBarStyle: "black-translucent",
  },
};

// Sin maximumScale ni userScalable: bloquear el zoom rompe accesibilidad
// (audit meta-viewport, peso 10 en Lighthouse) y iOS lo ignora igual.
export const viewport: Viewport = {
  themeColor: "#0b0d0c",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="es-CL"
      className={`${sora.variable} ${fraunces.variable} ${jetbrains.variable}`}
    >
      <body>
        {/* Registra el SW en el cliente sin bloquear el render */}
        <ServiceWorkerRegistrar />
        {/* Cookie ow_standalone en sync con el modo real (ver lib/standalone.ts) */}
        <StandaloneCookieSync />
        {PLAUSIBLE_DOMAIN && (
          <Script
            defer
            data-domain={PLAUSIBLE_DOMAIN}
            src="https://plausible.io/js/script.js"
            strategy="afterInteractive"
          />
        )}
        {children}
      </body>
    </html>
  );
}
