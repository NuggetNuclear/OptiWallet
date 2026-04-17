"use client";

import type { Recommendation } from "@/lib/types";
import { getBank } from "@/lib/data/banks";
import { formatCLP, modalityLabel } from "@/lib/format";

interface RecommendationCardProps {
  recommendation: Recommendation;
  amount?: number;
  compact?: boolean;
  onClick?: () => void;
}

export function RecommendationCard({ recommendation, amount, compact, onClick }: RecommendationCardProps) {
  const { promotion, card, merchant } = recommendation;
  const bank = getBank(card.bankId);

  const savings = amount
    ? Math.min(Math.round((amount * promotion.discount) / 100), promotion.cap ?? Infinity)
    : null;

  const Inner = (
    <>
      {/* Glow decorativo interno */}
      <div
        className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(255,255,255,0.3) 0%, transparent 70%)" }}
      />
      <div
        className="pointer-events-none absolute -left-12 -bottom-20 h-56 w-56 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(0,0,0,0.15) 0%, transparent 70%)" }}
      />

      <div className="relative">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-bg/70">
            {compact ? "Mejor opción" : "Paga con"}
          </span>
          <span className="rounded-full bg-bg/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-bg">
            {card.type === "credit" ? "Crédito" : "Débito"}
          </span>
        </div>

        <div className="mt-2 font-serif text-[26px] font-semibold leading-[1.05] tracking-[-0.02em] text-bg">
          {bank?.name ?? card.name}
        </div>

        <div className="mt-1 text-xs text-bg/75">{card.name}</div>

        <div className="mt-5 flex items-baseline gap-2">
          <span className="font-serif text-[64px] font-bold leading-none tracking-[-0.04em] text-bg">
            {promotion.discount}%
          </span>
          <span className="font-mono text-[10px] uppercase tracking-widest text-bg/70">
            descuento
          </span>
        </div>

        {savings !== null && (
          <div className="mt-2 font-mono text-[11px] text-bg/80">
            Ahorras ~{formatCLP(savings)} en {formatCLP(amount!)}
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-1.5">
          <Chip>{merchant.name}</Chip>
          <Chip>{modalityLabel(promotion.modality)}</Chip>
          {promotion.cap && <Chip>Tope {formatCLP(promotion.cap)}</Chip>}
          {promotion.code && (
            <Chip mono>
              <span className="opacity-70">Código: </span>
              {promotion.code}
            </Chip>
          )}
        </div>

        {promotion.conditions && (
          <div className="mt-3 text-[11px] italic text-bg/70">
            {promotion.conditions}
          </div>
        )}
      </div>
    </>
  );

  const className = `relative overflow-hidden rounded-[28px] p-6 text-bg transition-transform active:scale-[0.99] ${
    compact ? "p-5" : ""
  }`;
  const style = {
    background: "linear-gradient(135deg, #d4ff3a 0%, #a8d400 100%)",
    boxShadow: "0 20px 40px -20px rgba(212, 255, 58, 0.4)",
  };

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${className} w-full text-left`} style={style}>
        {Inner}
      </button>
    );
  }
  return (
    <div className={className} style={style}>
      {Inner}
    </div>
  );
}

function Chip({ children, mono }: { children: React.ReactNode; mono?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-bg/10 px-2.5 py-1 text-[11px] text-bg ${
        mono ? "font-mono text-[10px] uppercase tracking-wider" : ""
      }`}
    >
      {children}
    </span>
  );
}

/**
 * Alternativa más pequeña, para listas de opciones secundarias.
 */
export function AlternativeCard({ recommendation }: { recommendation: Recommendation }) {
  const { promotion, card, merchant } = recommendation;
  const bank = getBank(card.bankId);

  return (
    <div className="flex items-center justify-between rounded-2xl border border-line bg-bg-2 p-4 transition-colors hover:border-line-strong">
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-ink">{bank?.name ?? card.name}</div>
        <div className="mt-0.5 text-xs text-ink-dim">
          {merchant.name} · {modalityLabel(promotion.modality)}
          {promotion.code && (
            <>
              {" "}
              ·{" "}
              <span className="font-mono uppercase">{promotion.code}</span>
            </>
          )}
        </div>
      </div>
      <div className="ml-4 flex flex-col items-end">
        <span className="font-serif text-2xl font-semibold leading-none text-ink">
          {promotion.discount}%
        </span>
        {promotion.cap && (
          <span className="mt-1 font-mono text-[9px] uppercase tracking-wider text-ink-dim">
            tope {formatCLP(promotion.cap)}
          </span>
        )}
      </div>
    </div>
  );
}
