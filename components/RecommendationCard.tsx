"use client";

import { useEffect } from "react";
import { formatCLP, formatDiscount, modalityLabel } from "@/lib/format";
import { calculateSavingsForRec } from "@/lib/recommendations";
import { BANK_INFO } from "@/lib/constants";
import { events } from "@/lib/analytics";

interface RecommendationCardProps {
  recommendation: {
    promotion: {
      id: string;
      discount: number | null;
      discount_per_unit?: number | null;
      discount_unit?: string | null;
      stackable?: boolean;
      cap: number | null;
      min_purchase?: number | null;
      modality: string;
      code?: string | null;
      conditions?: string | null;
      source?: string | null;
    };
    card: {
      name: string;
      type: string;
      bankId: string;
    };
    merchant: {
      id?: string;
      name: string;
    };
    bankName: string;
  };
  amount?: number;
  units?: number;
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

export function RecommendationCard({ recommendation, amount, units, compact, onClick }: RecommendationCardProps) {
  const { promotion, card, merchant, bankName } = recommendation;
  const isPerUnit = promotion.discount_per_unit != null && promotion.discount_unit === "liter";

  useEffect(() => {
    events.promotionViewed({
      promotionId: promotion.id,
      merchantId: merchant.id || "",
      bankId: card.bankId,
      location: "winner",
    });
  }, [promotion.id, merchant.id, card.bankId]);

  const minPurchase = getMinPurchase(promotion);
  const belowMinimum = !isPerUnit && amount !== undefined && minPurchase !== null && amount < minPurchase;

  // Calcular ahorro usando la función unificada
  const savings = !belowMinimum
    ? calculateSavingsForRec(
        {
          discount: promotion.discount,
          discount_per_unit: promotion.discount_per_unit ?? null,
          discount_unit: promotion.discount_unit ?? null,
          cap: promotion.cap,
          min_purchase: minPurchase,
        },
        amount,
        units
      )
    : null;

  const Inner = (
    <>
      {/* Glow decorativo interno */}
      <div
        className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(255,255,255,0.15) 0%, transparent 70%)" }}
      />
      <div
        className="pointer-events-none absolute -left-12 -bottom-20 h-56 w-56 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(0,0,0,0.3) 0%, transparent 70%)" }}
      />

      <div className="relative">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/70">
            {compact ? "Mejor opción" : "Paga con"}
          </span>
          <span className="rounded-full bg-white/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-white">
            {card.type === "credit" ? "Crédito" : card.type === "debit" ? "Débito" : "Prepago"}
          </span>
        </div>

        <div className="mt-2 break-words font-serif text-[18px] font-semibold leading-[1.05] tracking-[-0.02em] text-white sm:text-[22px]">
          {bankName}
        </div>

        <div className="mt-1 break-words text-xs text-white/75">{card.name}</div>

        <div className="mt-5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="font-serif text-[40px] font-bold leading-none tracking-[-0.04em] text-white sm:text-[52px]">
            {formatDiscount(promotion.discount, promotion.discount_per_unit ?? null, promotion.discount_unit ?? null)}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-widest text-white/70">
            descuento
          </span>
        </div>

        {belowMinimum && (
          <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-white/15 px-2.5 py-1.5 font-mono text-[11px] text-white">
            <span>⚠️</span>
            <span>Monto bajo el mínimo requerido ({formatCLP(minPurchase!)})</span>
          </div>
        )}

        {savings !== null && savings > 0 && (
          <div className="mt-2 font-mono text-[11px] text-white/80">
            Ahorras ~{formatCLP(savings)}{" "}
            {isPerUnit && units ? `en ${units} L` : amount ? `en ${formatCLP(amount)}` : ""}
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-1.5">
          <Chip>{merchant.name}</Chip>
          <Chip>{modalityLabel(promotion.modality as "presencial" | "online" | "both")}</Chip>
          {promotion.cap && <Chip>Tope {formatCLP(promotion.cap)}</Chip>}
          {promotion.stackable && <Chip>⚡ Apilable</Chip>}
          {promotion.code && (
            <Chip mono>
              <span className="opacity-70">Código: </span>
              {promotion.code}
            </Chip>
          )}
        </div>

        {promotion.conditions && (
          <div className="mt-3 text-[11px] italic text-white/70">
            {promotion.conditions}
          </div>
        )}

        {promotion.source && (
          <a
            href={promotion.source}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              events.promotionClicked({
                promotionId: promotion.id,
                merchantId: merchant.id || "",
                bankId: card.bankId,
                location: "winner",
              });
            }}
            className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3.5 py-2 font-mono text-[11px] uppercase tracking-wider text-white backdrop-blur-sm transition-all hover:bg-white/25 hover:scale-[1.02] active:scale-[0.98]"
          >
            Ver oferta
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="opacity-70">
              <path d="M3.5 1.5H10.5V8.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M10.5 1.5L1.5 10.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </a>
        )}
      </div>
    </>
  );

  const bankColor = BANK_INFO[card.bankId]?.color ?? "#1a1f1c";
  const className = `relative overflow-hidden rounded-[24px] p-5 text-white transition-transform active:scale-[0.99] sm:rounded-[28px] sm:p-6 ${
    compact ? "sm:p-5" : ""
  }`;
  const style = {
    background: `linear-gradient(135deg, ${bankColor} 0%, rgba(11, 13, 12, 0.45) 100%)`,
    backgroundColor: bankColor,
    border: "1px solid rgba(255, 255, 255, 0.15)",
    boxShadow: `0 20px 40px -20px ${bankColor}80`,
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
      className={`inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[11px] text-white ${
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
  const { promotion, merchant, bankName, card } = recommendation;

  useEffect(() => {
    events.promotionViewed({
      promotionId: promotion.id,
      merchantId: merchant.id || "",
      bankId: card.bankId,
      location: "alternative",
    });
  }, [promotion.id, merchant.id, card.bankId]);

  return (
    <div className="flex items-center justify-between rounded-2xl border border-line bg-bg-2 p-4 transition-colors hover:border-line-strong">
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-ink">{bankName}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 overflow-hidden max-h-4 text-xs text-ink-dim min-w-0">
          <span className="truncate min-w-0 flex-shrink">{merchant.name}</span>
          <span className="flex items-center gap-x-1.5 before:content-['·'] before:text-ink-dim/50 shrink-0">
            {modalityLabel(promotion.modality as "presencial" | "online" | "both")}
          </span>
          {promotion.code && (
            <span className="flex items-center gap-x-1.5 before:content-['·'] before:text-ink-dim/50 shrink-0 font-mono uppercase">
              {promotion.code}
            </span>
          )}
        </div>
      </div>
      <div className="ml-4 flex flex-col items-end gap-1.5">
        <span className="font-serif text-2xl font-semibold leading-none text-ink">
          {formatDiscount(promotion.discount, promotion.discount_per_unit ?? null, promotion.discount_unit ?? null)}
        </span>
        {promotion.cap && (
          <span className="font-mono text-[9px] uppercase tracking-wider text-ink-dim">
            tope {formatCLP(promotion.cap)}
          </span>
        )}
        {promotion.source && (
          <a
            href={promotion.source}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              events.promotionClicked({
                promotionId: promotion.id,
                merchantId: merchant.id || "",
                bankId: card.bankId,
                location: "alternative",
              });
            }}
            className="font-mono text-[10px] text-accent hover:underline"
          >
            Ver oferta ↗
          </a>
        )}
      </div>
    </div>
  );
}
