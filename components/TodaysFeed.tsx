"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRecommendations } from "@/lib/hooks/use-api";
import { formatCLP, modalityLabel, formatDiscount } from "@/lib/format";
import { SkeletonCard } from "./SkeletonCard";
import type { ApiRecommendation } from "@/lib/api-client";

const PAGE_SIZE = 15;

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
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Agrupar por merchant y quedarnos con la mejor promo por comercio.
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
      return disc(b) - disc(a) || a.merchant_name.localeCompare(b.merchant_name);
    });
  }, [recs, sortBy]);

  // Resetear paginación cuando cambia el orden o el día (en render phase para evitar loops/efectos)
  const currentKey = `${date.getTime()}-${sortBy}`;
  const [prevKey, setPrevKey] = useState(currentKey);
  if (currentKey !== prevKey) {
    setPrevKey(currentKey);
    setVisibleCount(PAGE_SIZE);
  }

  // IntersectionObserver: carga más items al llegar al sentinel
  const loadMore = useCallback(() => {
    setVisibleCount((n) => Math.min(n + PAGE_SIZE, byMerchant.length));
  }, [byMerchant.length]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadMore(); },
      { rootMargin: "200px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore]);

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

  const visible = byMerchant.slice(0, visibleCount);
  const hasMore = visibleCount < byMerchant.length;

  return (
    <div className="grid gap-2">
      {visible.map((rec) => (
        <FeedRow
          key={rec.merchant_id}
          rec={rec}
          onClick={() => onMerchantClick(rec.merchant_id)}
        />
      ))}
      {/* Sentinel para IntersectionObserver */}
      {hasMore && (
        <div ref={sentinelRef} className="py-2 text-center">
          <div className="inline-flex gap-1">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-1 w-1 rounded-full bg-ink-dim opacity-40 animate-pulse"
                style={{ animationDelay: `${i * 150}ms` }}
              />
            ))}
          </div>
        </div>
      )}
      {!hasMore && byMerchant.length > PAGE_SIZE && (
        <p className="py-2 text-center font-mono text-[10px] uppercase tracking-widest text-ink-dim">
          {byMerchant.length} promociones · fin
        </p>
      )}
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
          <div className="mt-0.5 truncate text-xs text-ink-dim">
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
