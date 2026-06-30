"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRecommendations } from "@/lib/hooks/use-api";
import { formatCLP, modalityLabel, formatDiscount } from "@/lib/format";
import { SkeletonCard } from "./SkeletonCard";
import type { ApiRecommendation } from "@/lib/api-client";

import { rankRecommendations } from "@/lib/recommendations";

const PAGE_SIZE = 15;

interface MerchantFeedItem {
  merchant_id: string;
  merchant_name: string;
  emoji: string | null;
  popularity_prior: number;
  bestRec: ApiRecommendation;
  cards: Array<{ id: string; name: string }>;
}

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

  // Agrupar por merchant y recopilar las tarjetas de la mejor opción
  const byMerchant = useMemo(() => {
    const map = new Map<string, ApiRecommendation[]>();
    for (const rec of recs) {
      if (!map.has(rec.merchant_id)) {
        map.set(rec.merchant_id, []);
      }
      map.get(rec.merchant_id)!.push(rec);
    }

    const items: MerchantFeedItem[] = [];

    for (const [merchantId, merchantRecs] of map.entries()) {
      const ranked = rankRecommendations(merchantRecs);
      const best = ranked[0];
      // Obtener todas las tarjetas asociadas a esta misma promo y banco
      const matchingCards = ranked
        .filter((r) => r.promotion_id === best.promotion_id && r.bank_id === best.bank_id)
        .map((r) => ({ id: r.card_id, name: r.card_name }));

      items.push({
        merchant_id: merchantId,
        merchant_name: best.merchant_name,
        emoji: best.emoji,
        popularity_prior: best.popularity_prior,
        bestRec: best,
        cards: matchingCards,
      });
    }

    const disc = (item: MerchantFeedItem) => item.bestRec.discount ?? item.bestRec.discount_per_unit ?? 0;
    return items.sort((a, b) => {
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
      {visible.map((item) => (
        <FeedRow
          key={item.merchant_id}
          item={item}
          onClick={() => onMerchantClick(item.merchant_id)}
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

function FeedRow({ item, onClick }: { item: MerchantFeedItem; onClick: () => void }) {
  const rec = item.bestRec;
  const cardNamesLabel = item.cards.length === 1
    ? item.cards[0].name
    : item.cards.map((c) => c.name).join(", ");

  return (
    <button
      onClick={onClick}
      className="group flex w-full min-w-0 items-center gap-3 overflow-hidden rounded-2xl border border-line bg-bg-2 p-4 text-left transition-colors active:scale-[0.98] hover:border-lime"
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-bg-3 text-xl">
        {item.emoji ?? "🛍️"}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-ink">{item.merchant_name}</div>
        <div className="mt-0.5 flex max-h-4 flex-wrap items-center gap-x-1.5 overflow-hidden font-mono text-[10px] uppercase leading-4 tracking-widest text-ink-dim">
          <span className="min-w-0 flex-shrink truncate">{cardNamesLabel}</span>
          <span className="flex shrink-0 items-center gap-x-1.5 before:text-ink-dim/50 before:content-['·']">
            {modalityLabel(rec.modality as "presencial" | "online" | "both")}
          </span>
          {rec.cap && (
            <span className="flex shrink-0 items-center gap-x-1.5 before:text-ink-dim/50 before:content-['·']">
              tope {formatCLP(rec.cap)}
            </span>
          )}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="font-serif text-[22px] font-semibold leading-none text-lime">
          {formatDiscount(rec.discount, rec.discount_per_unit, rec.discount_unit)}
        </div>
      </div>
    </button>
  );
}
