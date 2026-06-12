"use client";

// components/InstallModal.tsx — Popup in-page con instrucciones de instalación
// de la PWA (Sprint 2). Tabs Android / iOS con autodetección de plataforma.
// En Android Chrome, si el browser disparó `beforeinstallprompt`, ofrece
// además instalación directa con un toque (prompt nativo).
// Estilos en app/landing.css (sección INSTALL MODAL).

import { useCallback, useEffect, useRef, useState } from "react";
import { events } from "@/lib/analytics";

type Platform = "android" | "ios";

// Evento no estándar de Chromium — no existe en lib.dom
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "android";
  return /iphone|ipad|ipod/i.test(navigator.userAgent) ? "ios" : "android";
}

const IOS_STEPS = [
  { title: "Abre esta página en Safari", desc: "Si estás en otra app (Instagram, Chrome), tócale los tres puntos y elige \"Abrir en Safari\"." },
  { title: "Toca el botón Compartir", desc: "El cuadrado con la flecha hacia arriba, abajo al centro de la pantalla." },
  { title: "\"Añadir a pantalla de inicio\"", desc: "Desliza el menú hacia arriba si no lo ves de inmediato." },
  { title: "Toca \"Añadir\" y listo", desc: "OptiWallet queda como una app: ícono propio, pantalla completa." },
];

const ANDROID_STEPS = [
  { title: "Abre esta página en Chrome", desc: "También funciona en Edge, Brave y Samsung Internet." },
  { title: "Toca el menú ⋮", desc: "Los tres puntos verticales, arriba a la derecha." },
  { title: "\"Agregar a la pantalla principal\"", desc: "En algunos teléfonos aparece como \"Instalar aplicación\"." },
  { title: "Confirma y listo", desc: "OptiWallet queda instalada como una app normal." },
];

interface InstallModalProps {
  open: boolean;
  onClose: () => void;
}

export function InstallModal({ open, onClose }: InstallModalProps) {
  // Plataforma autodetectada al montar (el modal solo se abre post-hidratación,
  // así que detectPlatform corre siempre en el cliente). Evita setState-in-effect.
  const [platform, setPlatform] = useState<Platform>(() => detectPlatform());
  const platformRef = useRef<Platform>(platform);
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);
  const [canPromptInstall, setCanPromptInstall] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Capturar beforeinstallprompt (Android Chrome) para ofrecer install nativo
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      deferredPrompt.current = e as BeforeInstallPromptEvent;
      setCanPromptInstall(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  useEffect(() => {
    if (open) {
      events.installInstructionsViewed(platformRef.current);
      // Bloquear scroll del body mientras el modal está abierto
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [open]);

  // Cerrar con Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const selectPlatform = useCallback((p: Platform) => {
    setPlatform(p);
    platformRef.current = p;
    events.installInstructionsViewed(p);
  }, []);

  const handleNativeInstall = useCallback(async () => {
    const evt = deferredPrompt.current;
    if (!evt) return;
    await evt.prompt();
    const { outcome } = await evt.userChoice;
    if (outcome === "accepted") {
      deferredPrompt.current = null;
      setCanPromptInstall(false);
      onClose();
    }
  }, [onClose]);

  if (!open) return null;

  const steps = platform === "ios" ? IOS_STEPS : ANDROID_STEPS;

  return (
    <div
      className="install-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div
        ref={dialogRef}
        className="install-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-modal-title"
      >
        <button className="install-modal-close" onClick={onClose} aria-label="Cerrar">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>

        <div className="install-modal-eyebrow">Sin App Store · directo del navegador</div>
        <h3 id="install-modal-title" className="install-modal-title">
          Agrega OptiWallet <em>al inicio.</em>
        </h3>

        {/* Selector de plataforma */}
        <div className="install-modal-tabs" role="tablist" aria-label="Plataforma">
          <button
            role="tab"
            aria-selected={platform === "android"}
            className={`install-modal-tab${platform === "android" ? " active" : ""}`}
            onClick={() => selectPlatform("android")}
          >
            🤖 Android
          </button>
          <button
            role="tab"
            aria-selected={platform === "ios"}
            className={`install-modal-tab${platform === "ios" ? " active" : ""}`}
            onClick={() => selectPlatform("ios")}
          >
             iPhone
          </button>
        </div>

        {/* Instalación nativa directa (solo si Chrome la ofreció) */}
        {platform === "android" && canPromptInstall && (
          <button className="install-modal-native" onClick={handleNativeInstall}>
            ⚡ Instalar ahora con un toque
          </button>
        )}

        {/* Pasos */}
        <ol className="install-modal-steps">
          {steps.map((step, i) => (
            <li key={i} className="install-modal-step">
              <span className="install-modal-step-num">{String(i + 1).padStart(2, "0")}</span>
              <div>
                <div className="install-modal-step-title">{step.title}</div>
                <div className="install-modal-step-desc">{step.desc}</div>
              </div>
            </li>
          ))}
        </ol>

        <p className="install-modal-foot">
          ¿Prefieres probarla primero? <a href="/app">Abrir en el navegador →</a>
        </p>
      </div>
    </div>
  );
}
