"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRecommendations } from "@/lib/hooks/use-api";
import { formatCLP, modalityLabel, formatDiscount } from "@/lib/format";
import { SkeletonCard } from "./SkeletonCard";
import type { ApiRecommendation } from "@/lib/api-client";
import { usePromoImpression, trackPromoTap } from "@/lib/hooks/use-promo-impression";
import type { FeedSortBy } from "@/lib/constants";

import { rankRecommendations } from "@/lib/recommendations";

// Tamaño de página para el scroll infinito dentro de una categoría seleccionada.
const PAGE_SIZE = 15;
// Cuántos comercios mostramos por categoría en la vista agrupada ("Todos").
// El resto se ve entrando a la categoría — evita la "muralla de ofertas".
const PREVIEW_PER_CATEGORY = 4;

interface MerchantFeedItem {
  merchant_id: string;
  merchant_name: string;
  emoji: string | null;
  popularity_prior: number;
  category_id: string;
  category_label: string;
  category_emoji: string | null;
  bestRec: ApiRecommendation;
  cards: Array<{ id: string; name: string }>;
}

interface CategoryBucket {
  id: string;
  label: string;
  emoji: string | null;
  items: MerchantFeedItem[];
}

interface TodaysFeedProps {
  cardIds: string[];
  date: Date;
  isToday: boolean;
  onMerchantClick: (merchantId: string) => void;
  sortBy: FeedSortBy;
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
  // Categoría activa: null = vista agrupada ("Todos") con previews por categoría.
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
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
        category_id: best.category_id,
        category_label: best.category_label,
        category_emoji: best.emoji,
        bestRec: best,
        cards: matchingCards,
      });
    }

    // "relevance": sin re-sort — el Map preserva el orden de inserción, y las
    // recs llegan ordenadas por el score compuesto de /api/recommendations
    // (la primera aparición de cada comercio es su promo mejor rankeada).
    if (sortBy === "relevance") return items;

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

  // Categorías presentes hoy, ordenadas por cantidad de ofertas (las más
  // grandes primero). Sirven tanto para los chips como para las secciones.
  const categories = useMemo<CategoryBucket[]>(() => {
    const map = new Map<string, CategoryBucket>();
    for (const item of byMerchant) {
      const existing = map.get(item.category_id);
      if (existing) {
        existing.items.push(item);
      } else {
        map.set(item.category_id, {
          id: item.category_id,
          label: item.category_label,
          emoji: item.category_emoji,
          items: [item],
        });
      }
    }
    return Array.from(map.values()).sort(
      (a, b) => b.items.length - a.items.length || a.label.localeCompare(b.label),
    );
  }, [byMerchant]);

  // Si la categoría filtrada deja de existir (cambió el día/tarjetas), volver a
  // "Todos". Ajuste de estado en fase de render (mismo patrón que prevKey abajo):
  // es condicional, así que React re-renderiza sin entrar en loop.
  if (categoryFilter !== null && !categories.some((c) => c.id === categoryFilter)) {
    setCategoryFilter(null);
  }

  // Items de la categoría seleccionada (vista plana con scroll infinito).
  const filteredItems = useMemo(
    () => (categoryFilter ? byMerchant.filter((i) => i.category_id === categoryFilter) : byMerchant),
    [byMerchant, categoryFilter],
  );

  // Resetear paginación cuando cambia orden / día / categoría (en render phase).
  const currentKey = `${date.getTime()}-${sortBy}-${categoryFilter ?? "all"}`;
  const [prevKey, setPrevKey] = useState(currentKey);
  if (currentKey !== prevKey) {
    setPrevKey(currentKey);
    setVisibleCount(PAGE_SIZE);
  }

  // IntersectionObserver: carga más items al llegar al sentinel (solo en vista filtrada).
  const loadMore = useCallback(() => {
    setVisibleCount((n) => Math.min(n + PAGE_SIZE, filteredItems.length));
  }, [filteredItems.length]);

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
          Prueba otro día o busca un comercio específico arriba.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Filtro por categoría — los chips reducen la "muralla de ofertas" */}
      <CategoryFilterBar
        categories={categories}
        active={categoryFilter}
        total={byMerchant.length}
        onSelect={setCategoryFilter}
      />

      {categoryFilter === null ? (
        <GroupedView
          categories={categories}
          onSelectCategory={setCategoryFilter}
          onMerchantClick={onMerchantClick}
        />
      ) : (
        <FlatView
          items={filteredItems}
          visibleCount={visibleCount}
          sentinelRef={sentinelRef}
          onMerchantClick={onMerchantClick}
        />
      )}
    </div>
  );
}

// ── Barra de chips de categoría ───────────────────────────────────────────
function CategoryFilterBar({
  categories,
  active,
  total,
  onSelect,
}: {
  categories: CategoryBucket[];
  active: string | null;
  total: number;
  onSelect: (id: string | null) => void;
}) {
  // Con una sola categoría los chips no aportan — la vista agrupada ya basta.
  if (categories.length <= 1) return null;

  return (
    <div className="no-scrollbar -mx-5 mb-5 flex gap-2 overflow-x-auto px-5 pb-1">
      <CategoryChip
        label="Todos"
        count={total}
        active={active === null}
        onClick={() => onSelect(null)}
      />
      {categories.map((cat) => (
        <CategoryChip
          key={cat.id}
          label={cat.label}
          emoji={cat.emoji}
          count={cat.items.length}
          active={active === cat.id}
          onClick={() => onSelect(active === cat.id ? null : cat.id)}
        />
      ))}
    </div>
  );
}

function CategoryChip({
  label,
  emoji,
  count,
  active,
  onClick,
}: {
  label: string;
  emoji?: string | null;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-medium transition-colors ${
        active
          ? "border-lime bg-lime text-bg"
          : "border-line bg-bg-2 text-ink hover:border-line-strong"
      }`}
    >
      {emoji && <span>{emoji}</span>}
      <span>{label}</span>
      <span className={`font-mono text-[10px] ${active ? "opacity-70" : "opacity-60"}`}>
        {count}
      </span>
    </button>
  );
}

// ── Vista agrupada ("Todos"): una sección por categoría con preview ────────
function GroupedView({
  categories,
  onSelectCategory,
  onMerchantClick,
}: {
  categories: CategoryBucket[];
  onSelectCategory: (id: string) => void;
  onMerchantClick: (merchantId: string) => void;
}) {
  return (
    <div className="space-y-7">
      {categories.map((cat) => {
        const preview = cat.items.slice(0, PREVIEW_PER_CATEGORY);
        const remaining = cat.items.length - preview.length;
        return (
          <section key={cat.id}>
            {/* Cabecera de categoría */}
            <div className="mb-3 flex items-center gap-2">
              {cat.emoji && <span className="text-base">{cat.emoji}</span>}
              <h2 className="font-mono text-[11px] uppercase tracking-[0.15em] text-ink-dim">
                {cat.label}
              </h2>
              <span className="font-mono text-[10px] text-ink-dim/60">{cat.items.length}</span>
            </div>
            <div className="grid gap-2">
              {preview.map((item) => (
                <FeedRow
                  key={item.merchant_id}
                  item={item}
                  onClick={() => onMerchantClick(item.merchant_id)}
                />
              ))}
            </div>
            {remaining > 0 && (
              <button
                onClick={() => onSelectCategory(cat.id)}
                className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-line bg-bg-2/40 py-3 font-mono text-[10px] uppercase tracking-widest text-ink-dim transition-colors hover:border-lime hover:text-lime"
              >
                Ver {remaining} más en {cat.label}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </button>
            )}
          </section>
        );
      })}
    </div>
  );
}

// ── Vista plana (categoría seleccionada) con scroll infinito ───────────────
function FlatView({
  items,
  visibleCount,
  sentinelRef,
  onMerchantClick,
}: {
  items: MerchantFeedItem[];
  visibleCount: number;
  sentinelRef: React.RefObject<HTMLDivElement | null>;
  onMerchantClick: (merchantId: string) => void;
}) {
  const visible = items.slice(0, visibleCount);
  const hasMore = visibleCount < items.length;

  return (
    <div className="grid gap-2">
      {visible.map((item) => (
        <FeedRow
          key={item.merchant_id}
          item={item}
          onClick={() => onMerchantClick(item.merchant_id)}
        />
      ))}
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
      {!hasMore && items.length > PAGE_SIZE && (
        <p className="py-2 text-center font-mono text-[10px] uppercase tracking-widest text-ink-dim">
          {items.length} promociones · fin
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

  // Solo a la DB (señal del ranking fase 3): el feed genera demasiadas
  // impresiones para mandarlas también a Plausible.
  usePromoImpression({
    promotionId: rec.promotion_id,
    merchantId: item.merchant_id,
    bankId: rec.bank_id,
    dbLocation: "feed",
  });

  return (
    <button
      onClick={() => {
        trackPromoTap({
          promotionId: rec.promotion_id,
          merchantId: item.merchant_id,
          bankId: rec.bank_id,
          dbLocation: "feed",
        });
        onClick();
      }}
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
