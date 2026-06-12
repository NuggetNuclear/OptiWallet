"use client";

// app/api-docs/page.tsx — Swagger UI integrado (US-003).
// Swagger UI se sirve self-hosted desde /public/swagger (la CSP solo permite
// scripts del propio origen — nada de CDNs). El spec viene de /api/openapi.json.
// Archivos de swagger-ui-dist@5.x; para actualizar: npm pack swagger-ui-dist
// y copiar swagger-ui-bundle.js + swagger-ui.css a public/swagger/.

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import Link from "next/link";

declare global {
  interface Window {
    SwaggerUIBundle?: (config: Record<string, unknown>) => unknown;
  }
}

export default function ApiDocsPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const initialized = useRef(false);

  useEffect(() => {
    if (!scriptReady || initialized.current || !window.SwaggerUIBundle) return;
    initialized.current = true;
    window.SwaggerUIBundle({
      url: "/api/openapi.json",
      domNode: containerRef.current,
      deepLinking: true,
      defaultModelsExpandDepth: 0,
      docExpansion: "list",
      tryItOutEnabled: true,
    });
  }, [scriptReady]);

  return (
    <div style={{ minHeight: "100dvh", background: "#fff" }}>
      {/* eslint-disable-next-line @next/next/no-css-tags -- swagger-ui.css es un asset estático self-hosted, no parte del build */}
      <link rel="stylesheet" href="/swagger/swagger-ui.css" />
      <Script
        src="/swagger/swagger-ui-bundle.js"
        strategy="afterInteractive"
        onLoad={() => setScriptReady(true)}
      />

      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 24px",
          background: "#0b0d0c",
          color: "#fff",
        }}
      >
        <Link href="/" style={{ color: "#d4ff3a", fontWeight: 700, textDecoration: "none" }}>
          ← OptiWallet
        </Link>
        <span style={{ fontFamily: "monospace", fontSize: 12, opacity: 0.7 }}>
          API v0.1.0-beta · OpenAPI 3.1 ·{" "}
          <a href="/api/openapi.json" style={{ color: "#d4ff3a" }}>
            openapi.json
          </a>
        </span>
      </header>

      <div ref={containerRef}>
        <p style={{ padding: 24, fontFamily: "monospace", fontSize: 13, color: "#555" }}>
          Cargando documentación de la API…
        </p>
      </div>
    </div>
  );
}
