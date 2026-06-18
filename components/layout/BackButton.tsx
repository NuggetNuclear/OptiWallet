"use client";

/**
 * Botón "Volver" estándar para barras superiores.
 * Centralizado para que el rediseño lo cambie en un solo lugar.
 */
export function BackButton({
  onClick,
  label = "Volver",
  dim = false,
}: {
  onClick: () => void;
  label?: string;
  /** true → versión atenuada (text-ink-dim) */
  dim?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 text-sm transition-colors ${
        dim ? "text-ink-dim hover:text-ink" : "text-ink hover:text-lime"
      }`}
      aria-label={label}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      >
        <path d="M19 12H5m0 0l6-6m-6 6l6 6" />
      </svg>
      {label}
    </button>
  );
}
