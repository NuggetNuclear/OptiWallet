"use client";

import { useMemo } from "react";
import { useRecommendations } from "@/lib/hooks/use-api";
import { formatCLP, modalityLabel, formatDiscount } from "@/lib/format";
import { SkeletonCard } from "./SkeletonCard";
import type { ApiRecommendation } from "@/lib/api-client";

interface TodaysFeedProps {
  cardIds: string[];
  date: Date;
  isToday: boolean;
  onMerchantClick: (merchantId: string) => void;
  sortBy: "name" | "popularity" | "discount";
}

export function TodaysFeed({
  cardIds,
  date,
  isToday,
  onMerchantClick,
  sortBy,
}: TodaysFeedProps) {
  const { data: recs, loading } = useRecommendations(cardIds, date);

  // Agrupar por merchant y quedarnos con la mejor promo por comercio.
  // Orden client-side (la respuesta viene cacheada s-maxage=60):
  // - name: alfabético por nombre del comercio, descuento como desempate.
  // - popularity: prior del comercio desc, descuento como desempate.
  // - discount: descuento desc, nombre como desempate.
  const byMerchant = useMemo(() => {
    const map = new Map<string, ApiRecommendation>();
    for (const rec of recs) {
      const existing = map.get(rec.merchant_id);
      const recVal = rec.discount ?? rec.discount_per_unit ?? 0;
      const extVal = existing ? (existing.discount ?? existing.discount_per_unit ?? 0) : -1;
      if (!existing || recVal > extVal) {
        map.set(rec.merchant_id, rec);
      }
    }
    const disc = (r: ApiRecommendation) => r.discount ?? r.discount_per_unit ?? 0;
    return Array.from(map.values()).sort((a, b) => {
      if (sortBy === "name") {
        return a.merchant_name.localeCompare(b.merchant_name) || disc(b) - disc(a);
      }
      if (sortBy === "popularity") {
        return b.popularity_prior - a.popularity_prior || disc(b) - disc(a) || a.merchant_name.localeCompare(b.merchant_name);
      }
      // sortBy === "discount"
      return disc(b) - disc(a) || a.merchant_name.localeCompare(b.merchant_name);
    });
  }, [recs, sortBy]);

  if (loading) {
    return (
      <div className="grid gap-2">
        {[1, 2, 3].map((i) => <SkeletonCard key={i} />)}
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
    <div className="grid gap-2">
      {byMerchant.map((rec) => (
        <FeedRow
          key={rec.merchant_id}
          rec={rec}
          onClick={() => onMerchantClick(rec.merchant_id)}
        />
      ))}
    </div>
  );
}

function FeedRow({ rec, onClick }: { rec: ApiRecommendation; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group flex w-full items-center justify-between rounded-2xl border border-line bg-bg-2 p-4 text-left transition-colors active:scale-[0.98] hover:border-lime"
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
        <div className="font-serif text-[22px] font-semibold leading-none text-lime">
          {formatDiscount(rec.discount, rec.discount_per_unit, rec.discount_unit)}
        </div>
      </div>
    </button>
  );
}
