"use client";

import { useMemo } from "react";
import { getRecommendations } from "@/lib/recommendation-engine";
import { getCategory } from "@/lib/data/categories";
import { formatCLP, modalityLabel } from "@/lib/format";
import type { Recommendation } from "@/lib/types";

interface TodaysFeedProps {
  cardIds: string[];
  date: Date;
  isToday: boolean;
  onMerchantClick: (merchantId: string) => void;
}

export function TodaysFeed({ cardIds, date, isToday, onMerchantClick }: TodaysFeedProps) {
  const recs = useMemo(() => {
    return getRecommendations({ cardIds, date });
  }, [cardIds, date]);

  // Agrupar por merchant y quedarnos con la mejor promo por comercio
  const byMerchant = useMemo(() => {
    const map = new Map<string, Recommendation>();
    for (const rec of recs) {
      const existing = map.get(rec.merchant.id);
      if (!existing || rec.promotion.discount > existing.promotion.discount) {
        map.set(rec.merchant.id, rec);
      }
    }
    return Array.from(map.values()).sort(
      (a, b) => b.promotion.discount - a.promotion.discount,
    );
  }, [recs]);

  const topRec = byMerchant[0];
  const rest = byMerchant.slice(1);

  if (byMerchant.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line bg-bg-2/40 p-8 text-center">
        <div className="font-serif text-xl text-ink">
          {isToday ? "Hoy no hay promos para tus tarjetas." : "Nada para este día."}
        </div>
        <p className="mt-2 text-sm text-ink-dim">
          Prueba otro día o busca un comercio específico más abajo.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Highlight: el mejor descuento del día */}
      {topRec && (
        <HighlightCard
          rec={topRec}
          onClick={() => onMerchantClick(topRec.merchant.id)}
        />
      )}

      {/* Resto de promos del día */}
      {rest.length > 0 && (
        <>
          <h3 className="mt-6 font-mono text-[11px] uppercase tracking-[0.15em] text-ink-dim">
            Más promos disponibles
          </h3>
          <div className="grid gap-2">
            {rest.map((rec) => (
              <FeedRow
                key={rec.merchant.id}
                rec={rec}
                onClick={() => onMerchantClick(rec.merchant.id)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function HighlightCard({
  rec,
  onClick,
}: {
  rec: Recommendation;
  onClick: () => void;
}) {
  const category = getCategory(rec.merchant.categoryId);
  return (
    <button
      onClick={onClick}
      className="relative w-full overflow-hidden rounded-[28px] p-6 text-left transition-transform active:scale-[0.99]"
      style={{
        background: "linear-gradient(135deg, #d4ff3a 0%, #a8d400 100%)",
        boxShadow: "0 20px 40px -20px rgba(212, 255, 58, 0.4)",
      }}
    >
      {/* Glow decorativo */}
      <div
        className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(255,255,255,0.3) 0%, transparent 70%)" }}
      />

      <div className="relative">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-bg/70">
            Mejor promo · {category?.label}
          </span>
          <span className="text-2xl">{category?.emoji}</span>
        </div>

        <div className="mt-3 font-serif text-[34px] font-semibold leading-[1.05] tracking-[-0.02em] text-bg">
          {rec.merchant.name}
        </div>

        <div className="mt-5 flex items-baseline gap-2">
          <span className="font-serif text-[64px] font-bold leading-none tracking-[-0.04em] text-bg">
            {rec.promotion.discount}%
          </span>
          <span className="font-mono text-[10px] uppercase tracking-widest text-bg/70">
            descuento
          </span>
        </div>

        <div className="mt-3 text-sm text-bg/80">
          Paga con <span className="font-semibold">{rec.card.name}</span>
        </div>

        <div className="mt-4 inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-widest text-bg/70">
          Ver detalles
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </div>
      </div>
    </button>
  );
}

function FeedRow({ rec, onClick }: { rec: Recommendation; onClick: () => void }) {
  const category = getCategory(rec.merchant.categoryId);
  return (
    <button
      onClick={onClick}
      className="group flex w-full items-center justify-between rounded-2xl border border-line bg-bg-2 p-4 text-left transition-all hover:border-lime"
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-bg-3 text-xl">
          {category?.emoji ?? "🛍️"}
        </div>
        <div className="min-w-0">
          <div className="truncate font-medium text-ink">{rec.merchant.name}</div>
          <div className="mt-0.5 text-xs text-ink-dim">
            {rec.card.name} · {modalityLabel(rec.promotion.modality)}
            {rec.promotion.cap && <> · tope {formatCLP(rec.promotion.cap)}</>}
          </div>
        </div>
      </div>
      <div className="ml-3 text-right">
        <div className="font-serif text-[28px] font-semibold leading-none text-lime">
          {rec.promotion.discount}%
        </div>
      </div>
    </button>
  );
}
