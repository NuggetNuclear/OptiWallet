"use client";

import { useEffect, useRef } from "react";

export interface TerminalLine {
  msg: string;
  level: "info" | "warn" | "error" | "success";
}

interface Props {
  title: string;
  lines: TerminalLine[];
  done: boolean;
  onClose: () => void;
}

const LEVEL_COLOR: Record<TerminalLine["level"], string> = {
  info:    "#c8d3f5",
  warn:    "#ffc777",
  error:   "#ff757f",
  success: "#c3e88d",
};

export function TerminalConsole({ title, lines, done, onClose }: Props) {
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [lines]);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(0,0,0,0.72)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "24px",
    }}>
      <div style={{
        width: "100%", maxWidth: 640,
        background: "#1e1f2e",
        borderRadius: 12,
        boxShadow: "0 32px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.08)",
        overflow: "hidden",
        display: "flex", flexDirection: "column",
        maxHeight: "80vh",
      }}>
        {/* Title bar */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "10px 14px",
          background: "#2a2b3d",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          flexShrink: 0,
        }}>
          {/* Traffic lights */}
          <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#ff5f57", display: "inline-block", flexShrink: 0 }} />
          <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#febc2e", display: "inline-block", flexShrink: 0 }} />
          <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#28c840", display: "inline-block", flexShrink: 0 }} />
          <span style={{
            flex: 1, textAlign: "center",
            fontSize: 12, fontFamily: "var(--font-jetbrains, monospace)",
            color: "rgba(255,255,255,0.45)",
            letterSpacing: "0.04em",
          }}>
            {title}
          </span>
        </div>

        {/* Log body */}
        <div ref={bodyRef} style={{
          flex: 1, overflowY: "auto",
          padding: "14px 18px",
          fontFamily: "var(--font-jetbrains, monospace)",
          fontSize: 12,
          lineHeight: 1.7,
          minHeight: 200,
        }}>
          {lines.length === 0 ? (
            <span style={{ color: "rgba(255,255,255,0.25)" }}>Iniciando…</span>
          ) : (
            lines.map((l, i) => (
              <div key={i} style={{ color: LEVEL_COLOR[l.level], whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                <span style={{ color: "rgba(255,255,255,0.2)", userSelect: "none" }}>
                  {l.level === "error" ? "✗ " : l.level === "warn" ? "⚠ " : l.level === "success" ? "✓ " : "› "}
                </span>
                {l.msg}
              </div>
            ))
          )}
          {!done && (
            <div style={{ color: "rgba(255,255,255,0.3)", marginTop: 4 }}>
              <span style={{ animation: "blink 1s step-end infinite" }}>▌</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          borderTop: "1px solid rgba(255,255,255,0.07)",
          padding: "10px 18px",
          display: "flex", justifyContent: "flex-end",
          background: "#1a1b2a",
          flexShrink: 0,
        }}>
          <button
            onClick={onClose}
            disabled={!done}
            className="admin-btn admin-btn-ghost admin-btn-sm"
            style={{ opacity: done ? 1 : 0.4, transition: "opacity 0.2s" }}
          >
            {done ? "Cerrar" : "Procesando…"}
          </button>
        </div>
      </div>

      <style>{`@keyframes blink { 50% { opacity: 0; } }`}</style>
    </div>
  );
}
