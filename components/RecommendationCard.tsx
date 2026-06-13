"use client";

import { formatCLP, modalityLabel } from "@/lib/format";
import { calculateSavings } from "@/lib/recommendations";

interface RecommendationCardProps {
  recommendation: {
    promotion: {
      id: string;
      discount: number;
      cap: number | null;
      min_purchase?: number | null;
      modality: string;
      code?: string | null;
      conditions?: string | null;
    };
    card: {
      name: string;
      type: string;
      bankId: string;
    };
    merchant: {
      name: string;
    };
    bankName: string;
  };
  amount?: number;
  compact?: boolean;
  onClick?: () => void;
}

/**
 * Extract a minimum purchase amount from the structured field or from
 * free-text `conditions` as a fallback (e.g. "sobre $10.000").
 */
function getMinPurchase(promotion: RecommendationCardProps["recommendation"]["promotion"]): number | null {
  if (promotion.min_purchase) return promotion.min_purchase;
  if (!promotion.conditions) return null;
  const match = promotion.conditions.match(/sobre\s*\$\s*([\d.]+)/i)
    ?? promotion.conditions.match(/m[ií]nimo\s*\$\s*([\d.]+)/i);
  if (!match) return null;
  return parseInt(match[1].replace(/\./g, ""), 10) || null;
}

export function RecommendationCard({ recommendation, amount, compact, onClick }: RecommendationCardProps) {
  const { promotion, card, merchant, bankName } = recommendation;

  const minPurchase = getMinPurchase(promotion);
  const belowMinimum = amount !== undefined && minPurchase !== null && amount < minPurchase;

  const savings = amount !== undefined && !belowMinimum
    ? calculateSavings(amount, promotion.discount, promotion.cap, minPurchase)
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

        <div className="mt-2 break-words font-serif text-[22px] font-semibold leading-[1.05] tracking-[-0.02em] text-bg sm:text-[26px]">
          {bankName}
        </div>

        <div className="mt-1 break-words text-xs text-bg/75">{card.name}</div>

        <div className="mt-5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="font-serif text-[52px] font-bold leading-none tracking-[-0.04em] text-bg sm:text-[64px]">
            {promotion.discount}%
          </span>
          <span className="font-mono text-[10px] uppercase tracking-widest text-bg/70">
            descuento
          </span>
        </div>

        {belowMinimum && (
          <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-bg/15 px-2.5 py-1.5 font-mono text-[11px] text-bg">
            <span>⚠️</span>
            <span>Monto bajo el mínimo requerido ({formatCLP(minPurchase!)})</span>
          </div>
        )}

        {savings !== null && (
          <div className="mt-2 font-mono text-[11px] text-bg/80">
            Ahorras ~{formatCLP(savings)} en {formatCLP(amount!)}
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-1.5">
          <Chip>{merchant.name}</Chip>
          <Chip>{modalityLabel(promotion.modality as "presencial" | "online" | "both")}</Chip>
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

  const className = `relative overflow-hidden rounded-[24px] p-5 text-bg transition-transform active:scale-[0.99] sm:rounded-[28px] sm:p-6 ${
    compact ? "sm:p-5" : ""
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
export function AlternativeCard({ recommendation }: { recommendation: RecommendationCardProps["recommendation"] }) {
  const { promotion, merchant, bankName } = recommendation;

  return (
    <div className="flex items-center justify-between rounded-2xl border border-line bg-bg-2 p-4 transition-colors hover:border-line-strong">
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-ink">{bankName}</div>
        <div className="mt-0.5 text-xs text-ink-dim">
          {merchant.name} · {modalityLabel(promotion.modality as "presencial" | "online" | "both")}
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
