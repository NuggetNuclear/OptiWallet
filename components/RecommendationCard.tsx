"use client";

import { useState } from "react";
import { formatCLP, formatDiscount, modalityLabel } from "@/lib/format";
import { calculateSavingsForRec } from "@/lib/recommendations";
import { BANK_INFO } from "@/lib/constants";
import { usePromoImpression, trackPromoTap } from "@/lib/hooks/use-promo-impression";
import { PromoFeedback } from "./PromoFeedback";

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
    cards: Array<{
      id: string;
      name: string;
      type: string;
    }>;
    merchant: {
      id?: string;
      name: string;
    };
    bankId: string;
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
  const { promotion, cards, merchant, bankName, bankId } = recommendation;
  const isPerUnit = promotion.discount_per_unit != null && promotion.discount_unit === "liter";

  usePromoImpression({
    promotionId: promotion.id,
    merchantId: merchant.id || "",
    bankId,
    dbLocation: "merchant_detail",
    plausibleLocation: "winner",
  });

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

  const cardTypes = Array.from(new Set(cards.map((c) => c.type)));
  const cardTypesLabel = cardTypes
    .map((t) => (t === "credit" ? "Crédito" : t === "debit" ? "Débito" : "Prepago"))
    .join(" / ");

  const cardNamesLabel = cards.length === 1 
    ? cards[0].name 
    : `Aplica con: ${cards.map((c) => c.name).join(", ")}`;

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

      <div className="relative z-10">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/70">
            {compact ? "Mejor opción" : "Paga con"}
          </span>
          <span className="rounded-full bg-white/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-white">
            {cardTypesLabel}
          </span>
        </div>

        <div className="mt-2 break-words font-serif text-[18px] font-semibold leading-[1.05] tracking-[-0.02em] text-white sm:text-[22px]">
          {bankName}
        </div>

        <div className="mt-1 break-words text-xs text-white/75">{cardNamesLabel}</div>

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

        <div className="mt-4 flex items-center justify-between gap-4 flex-wrap">
          {promotion.source ? (
            <a
              href={promotion.source}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => {
                e.stopPropagation();
                trackPromoTap({
                  promotionId: promotion.id,
                  merchantId: merchant.id || "",
                  bankId,
                  dbLocation: "merchant_detail",
                  plausibleLocation: "winner",
                });
              }}
              className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3.5 py-2 font-mono text-[11px] uppercase tracking-wider text-white backdrop-blur-sm transition-all hover:bg-white/25 hover:scale-[1.02] active:scale-[0.98]"
            >
              Ver oferta
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="opacity-70">
                <path d="M3.5 1.5H10.5V8.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M10.5 1.5L1.5 10.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </a>
          ) : (
            <div />
          )}

          {/* Feedback + reporte (captura en dos fases) */}
          <div className="flex flex-wrap items-center justify-end gap-2 rounded-2xl border border-white/5 bg-black/10 px-3 py-1.5">
            <PromoFeedback
              promotionId={promotion.id}
              merchantId={merchant.id || ""}
              bankId={bankId}
              tone="onColor"
            />
          </div>
        </div>
      </div>
    </>
  );

  const bankColor = BANK_INFO[bankId]?.color ?? "#1a1f1c";
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
 * Alternativa agrupada y colapsable por banco y promoción.
 */
export function GroupedAlternativeCard({
  recommendation,
}: {
  recommendation: RecommendationCardProps["recommendation"];
}) {
  const { promotion, merchant, bankName, cards, bankId } = recommendation;
  const [isOpen, setIsOpen] = useState(false);

  // Una impresión por grupo (no una por tarjeta): la promo es la misma,
  // duplicar el evento por cada tarjeta inflaba las vistas.
  usePromoImpression({
    promotionId: promotion.id,
    merchantId: merchant.id || "",
    bankId,
    dbLocation: "merchant_detail",
    plausibleLocation: "alternative",
  });

  return (
    <div className="rounded-2xl border border-line bg-bg-2 overflow-hidden transition-colors hover:border-line-strong">
      {/* Header of the Group */}
      <button
        type="button"
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between p-4 text-left cursor-pointer select-none"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="min-w-0 flex-1">
          <div className="font-medium text-ink flex items-center gap-2">
            <span>{bankName}</span>
            {cards.length > 1 && (
              <span className="rounded-full bg-bg-3 px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-ink-dim">
                {cards.length} tarjetas
              </span>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 overflow-hidden max-h-4 text-xs text-ink-dim min-w-0">
            <span className="truncate min-w-0 flex-shrink">{merchant.name}</span>
            <span className="flex items-center gap-x-1.5 before:content-['·'] before:text-ink-dim/50 shrink-0">
              {modalityLabel(promotion.modality as "presencial" | "online" | "both")}
            </span>
          </div>
        </div>
        <div className="ml-4 flex items-center gap-3">
          <div className="flex flex-col items-end gap-0.5">
            <span className="font-serif text-2xl font-semibold leading-none text-ink">
              {formatDiscount(promotion.discount, promotion.discount_per_unit ?? null, promotion.discount_unit ?? null)}
            </span>
            {promotion.cap && (
              <span className="font-mono text-[9px] uppercase tracking-wider text-ink-dim">
                tope {formatCLP(promotion.cap)}
              </span>
            )}
          </div>
          <span className={`text-ink-dim transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </span>
        </div>
      </button>

      {/* Expanded list of cards & details */}
      {isOpen && (
        <div className="border-t border-line bg-bg-1/40 p-4 space-y-3 text-sm text-ink-dim">
          <div>
            <span className="font-mono text-[9px] uppercase tracking-wider block mb-1.5">Tarjetas aplicables:</span>
            <ul className="space-y-1.5 pl-2 border-l border-line">
              {cards.map((c) => (
                <li key={c.id} className="flex items-center justify-between text-ink">
                  <span className="font-medium">{c.name}</span>
                  <span className="text-[10px] font-mono uppercase text-ink-dim">
                    {c.type === "credit" ? "Crédito" : c.type === "debit" ? "Débito" : "Prepago"}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {promotion.conditions && (
            <div>
              <span className="font-mono text-[9px] uppercase tracking-wider block">Condiciones:</span>
              <p className="mt-0.5 text-xs italic">{promotion.conditions}</p>
            </div>
          )}

          {promotion.code && (
            <div className="flex items-center gap-2">
              <span className="font-mono text-[9px] uppercase tracking-wider">Código:</span>
              <span className="font-mono text-xs px-1.5 py-0.5 bg-bg-3 text-ink rounded">
                {promotion.code}
              </span>
            </div>
          )}

          <div className="flex items-center justify-between gap-4 pt-1 flex-wrap">
            {promotion.source ? (
              <a
                href={promotion.source}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => {
                  e.stopPropagation();
                  trackPromoTap({
                    promotionId: promotion.id,
                    merchantId: merchant.id || "",
                    bankId,
                    dbLocation: "merchant_detail",
                    plausibleLocation: "alternative",
                  });
                }}
                className="inline-flex items-center gap-1 font-mono text-[10px] text-accent hover:underline"
              >
                Ver oferta ↗
              </a>
            ) : (
              <div />
            )}

            {/* Feedback + reporte (captura en dos fases) */}
            <div className="flex flex-wrap items-center justify-end gap-2 rounded-full border border-line bg-bg-3 px-2.5 py-1">
              <PromoFeedback
                promotionId={promotion.id}
                merchantId={merchant.id || ""}
                bankId={bankId}
                tone="onSurface"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
