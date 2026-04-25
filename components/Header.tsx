"use client";

import Link from "next/link";

interface HeaderProps {
  onOpenWallet: () => void;
  onSearchClick?: () => void;
  cardCount: number;
}

export function Header({ onOpenWallet, onSearchClick, cardCount }: HeaderProps) {
  return (
    <header
      className="sticky top-0 z-40 flex items-center justify-between border-b border-line bg-bg/80 px-5 backdrop-blur-xl"
      style={{
        paddingTop: "calc(var(--safe-top) + 14px)",
        paddingBottom: "14px",
      }}
    >
      <Link href="/" className="flex items-center gap-2">
        <span
          className="pulse-dot inline-block h-2.5 w-2.5 rounded-full bg-lime"
          style={{ boxShadow: "0 0 20px var(--lime)" }}
        />
        <span className="font-serif text-[22px] font-black tracking-[-0.03em] text-ink">
          OptiWallet
        </span>
      </Link>

      <div className="flex items-center gap-2">
        {onSearchClick && (
          <button
            onClick={onSearchClick}
            className="flex items-center justify-center rounded-full border border-line bg-bg-2 px-3 py-2 text-ink transition-colors hover:border-lime hover:text-lime"
            aria-label="Buscar"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </button>
        )}
        <button
          onClick={onOpenWallet}
          className="flex items-center gap-2 rounded-full border border-line bg-bg-2 px-3.5 py-2 text-xs font-medium text-ink transition-colors hover:border-lime hover:text-lime"
          aria-label="Abrir mi wallet"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="2" y="6" width="20" height="14" rx="2" />
            <path d="M2 10h20" />
          </svg>
          <span>{cardCount > 0 ? `${cardCount} tarjeta${cardCount > 1 ? "s" : ""}` : "Mi wallet"}</span>
        </button>
      </div>
    </header>
  );
}
