"use client";

import { useMemo } from "react";
import { useRecommendations } from "@/lib/hooks/use-api";
import { formatCLP, modalityLabel } from "@/lib/format";
import type { ApiRecommendation } from "@/lib/api-client";

interface TodaysFeedProps {
  cardIds: string[];
  date: Date;
  isToday: boolean;
  onMerchantClick: (merchantId: string) => void;
}

export function TodaysFeed({ cardIds, date, isToday, onMerchantClick }: TodaysFeedProps) {
  const { data: recs, loading } = useRecommendations(cardIds, date);

  // Agrupar por merchant y quedarnos con la mejor promo por comercio
  const byMerchant = useMemo(() => {
    const map = new Map<string, ApiRecommendation>();
    for (const rec of recs) {
      const existing = map.get(rec.merchant_id);
      if (!existing || rec.discount > existing.discount) {
        map.set(rec.merchant_id, rec);
      }
    }
    return Array.from(map.values()).sort((a, b) => b.discount - a.discount);
  }, [recs]);

  const topRec = byMerchant[0];
  const rest = byMerchant.slice(1);

  if (loading) {
    return (
      <div className="space-y-3">
        {/* Skeleton de la highlight card */}
        <div className="animate-pulse rounded-[24px] bg-bg-3/60 p-5 sm:rounded-[28px] sm:p-6">
          <div className="h-3 w-24 rounded bg-bg-3" />
          <div className="mt-4 h-8 w-48 rounded bg-bg-3" />
          <div className="mt-6 h-16 w-28 rounded bg-bg-3" />
          <div className="mt-4 h-4 w-36 rounded bg-bg-3" />
        </div>
        {/* Skeleton de las filas */}
        {[1, 2].map((i) => (
          <div key={i} className="animate-pulse rounded-2xl border border-line bg-bg-2 p-4">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-xl bg-bg-3" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-32 rounded bg-bg-3" />
                <div className="h-3 w-48 rounded bg-bg-3" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

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
          onClick={() => onMerchantClick(topRec.merchant_id)}
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
                key={rec.merchant_id}
                rec={rec}
                onClick={() => onMerchantClick(rec.merchant_id)}
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
  rec: ApiRecommendation;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="relative w-full overflow-hidden rounded-[24px] p-5 text-left transition-transform active:scale-[0.99] sm:rounded-[28px] sm:p-6"
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
        <div className="flex items-center justify-between gap-3">
          <span className="min-w-0 truncate font-mono text-[10px] uppercase tracking-[0.18em] text-bg/70">
            Mejor promo · {rec.category_label}
          </span>
          <span className="shrink-0 text-2xl">{rec.emoji}</span>
        </div>

        <div className="mt-3 break-words font-serif text-[28px] font-semibold leading-[1.05] tracking-[-0.02em] text-bg sm:text-[34px]">
          {rec.merchant_name}
        </div>

        <div className="mt-5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="font-serif text-[52px] font-bold leading-none tracking-[-0.04em] text-bg sm:text-[64px]">
            {rec.discount}%
          </span>
          <span className="font-mono text-[10px] uppercase tracking-widest text-bg/70">
            descuento
          </span>
        </div>

        <div className="mt-3 break-words text-sm text-bg/80">
          Paga con <span className="font-semibold">{rec.card_name}</span>
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

function FeedRow({ rec, onClick }: { rec: ApiRecommendation; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group flex w-full items-center justify-between rounded-2xl border border-line bg-bg-2 p-4 text-left transition-all hover:border-lime"
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-bg-3 text-xl">
          {rec.emoji ?? "🛍️"}
        </div>
        <div className="min-w-0">
          <div className="truncate font-medium text-ink">{rec.merchant_name}</div>
          <div className="mt-0.5 text-xs text-ink-dim">
            {rec.card_name} · {modalityLabel(rec.modality as "presencial" | "online" | "both")}
            {rec.cap && <> · tope {formatCLP(rec.cap)}</>}
          </div>
        </div>
      </div>
      <div className="ml-3 text-right">
        <div className="font-serif text-[28px] font-semibold leading-none text-lime">
          {rec.discount}%
        </div>
      </div>
    </button>
  );
}
