"use client";

import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import { useMerchants, useCategories } from "@/lib/hooks/use-api";
import { SkeletonCard } from "./SkeletonCard";
import type { ApiMerchant } from "@/lib/api-client";

interface MerchantSearchProps {
  onSelect: (merchantId: string) => void;
  sortBy: "name" | "popularity" | "discount";
}

export interface MerchantSearchHandle {
  focusInput: () => void;
}

export const MerchantSearch = forwardRef<MerchantSearchHandle, MerchantSearchProps>(
  function MerchantSearch({ onSelect, sortBy }, ref) {
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    focusInput: () => inputRef.current?.focus({ preventScroll: true }),
  }));

  const { data: merchants, loading: merchantsLoading } = useMerchants(query, categoryFilter);
  const { data: categories, loading: categoriesLoading } = useCategories();

  const sortedMerchants = useMemo(() => {
    const copy = [...merchants];
    copy.sort((a, b) => {
      if (sortBy === "popularity") {
        return b.popularity_prior - a.popularity_prior || a.name.localeCompare(b.name);
      }
      return a.name.localeCompare(b.name);
    });
    return copy;
  }, [merchants, sortBy]);

  const categoryStats = categories.filter((c) => c.merchant_count > 0);

  // Modo browse: sin query ni filtro activo → agrupar por categoría
  const isBrowse = query === "" && categoryFilter === null;

  const byCategory = useMemo(() => {
    if (!isBrowse) return null;
    const map = new Map<string, { label: string; emoji?: string; merchants: ApiMerchant[] }>();
    for (const cat of categoryStats) {
      map.set(cat.id, { label: cat.label, emoji: cat.emoji, merchants: [] });
    }
    for (const m of sortedMerchants) {
      const bucket = map.get(m.category_id ?? "");
      if (bucket) bucket.merchants.push(m);
    }
    // Filtrar categorías vacías y ordenar por count desc
    return Array.from(map.values()).filter((c) => c.merchants.length > 0);
  }, [isBrowse, sortedMerchants, categoryStats]);

  return (
    <div>
      {/* Search input */}
      <div className="relative">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-dim"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar comercio..."
          className="w-full rounded-2xl border border-line bg-bg-2 py-3.5 pl-11 pr-4 text-[16px] text-ink placeholder:text-ink-dim focus:border-lime focus:outline-none"
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-bg-3 p-1 text-ink-dim transition-colors hover:text-ink"
            aria-label="Limpiar búsqueda"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Category chips — solo en modo filtro/búsqueda */}
      {!isBrowse && (
        <div className="no-scrollbar mt-4 -mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
          <CategoryChip
            label="Todos"
            active={categoryFilter === null}
            onClick={() => setCategoryFilter(null)}
          />
          {categoriesLoading
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-9 w-24 shrink-0 animate-pulse rounded-full bg-bg-3" />
              ))
            : categoryStats.map((cat) => (
                <CategoryChip
                  key={cat.id}
                  label={cat.label}
                  emoji={cat.emoji}
                  active={categoryFilter === cat.id}
                  count={cat.merchant_count}
                  onClick={() =>
                    setCategoryFilter(categoryFilter === cat.id ? null : cat.id)
                  }
                />
              ))}
        </div>
      )}

      {/* Modo browse: secciones por categoría */}
      {isBrowse && (
        <div className="mt-5 space-y-6">
          {merchantsLoading || categoriesLoading ? (
            Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)
          ) : byCategory && byCategory.length > 0 ? (
            byCategory.map((cat) => (
              <div key={cat.label}>
                {/* Cabecera de categoría */}
                <button
                  onClick={() => setCategoryFilter(
                    categoryStats.find((c) => c.label === cat.label)?.id ?? null
                  )}
                  className="group mb-3 flex w-full items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    {cat.emoji && <span className="text-base">{cat.emoji}</span>}
                    <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-ink-dim group-hover:text-ink transition-colors">
                      {cat.label}
                    </span>
                  </div>
                  <span className="font-mono text-[10px] text-ink-dim group-hover:text-lime transition-colors">
                    ver todos →
                  </span>
                </button>
                <div className="space-y-2">
                  {cat.merchants.map((merchant) => (
                    <MerchantRow
                      key={merchant.id}
                      merchant={merchant}
                      onClick={() => onSelect(merchant.id)}
                    />
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-line bg-bg-2/40 p-8 text-center">
              <div className="mt-2 text-sm text-ink">No hay comercios disponibles.</div>
            </div>
          )}
        </div>
      )}

      {/* Modo búsqueda/filtro: lista plana */}
      {!isBrowse && (
        <div className="mt-5 space-y-2">
          {merchantsLoading ? (
            Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)
          ) : sortedMerchants.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line bg-bg-2/40 p-8 text-center">
              <div className="font-mono text-[10px] uppercase tracking-widest text-ink-dim">
                Sin resultados
              </div>
              <div className="mt-2 text-sm text-ink">
                {query
                  ? `No encontramos "${query}".`
                  : "No hay comercios en esta categoría."}
              </div>
              <div className="mt-1 text-xs text-ink-dim">
                Puede que aún no cubramos ese comercio.
              </div>
            </div>
          ) : (
            sortedMerchants.map((merchant) => (
              <MerchantRow
                key={merchant.id}
                merchant={merchant}
                onClick={() => onSelect(merchant.id)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
});

function CategoryChip({
  label,
  emoji,
  active,
  count,
  onClick,
}: {
  label: string;
  emoji?: string;
  active: boolean;
  count?: number;
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
      {count !== undefined && !active && (
        <span className="font-mono text-[10px] opacity-60">{count}</span>
      )}
    </button>
  );
}

function MerchantRow({ merchant, onClick }: { merchant: ApiMerchant; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-2xl border border-line bg-bg-2 p-4 text-left transition-all hover:border-lime hover:translate-x-1"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-bg-3 text-xl">
          {merchant.emoji ?? "🛍️"}
        </div>
        <div>
          <div className="font-medium text-ink">{merchant.name}</div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-ink-dim">
            {merchant.category_label}
          </div>
        </div>
      </div>
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        className="text-ink-dim"
      >
        <path d="m9 18 6-6-6-6" />
      </svg>
    </button>
  );
}
