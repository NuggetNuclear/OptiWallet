"use client";

import { useMemo, useState } from "react";
import { CATEGORIES, getCategory } from "@/lib/data/categories";
import { MERCHANTS, searchMerchants } from "@/lib/data/merchants";
import type { Merchant } from "@/lib/types";

interface MerchantSearchProps {
  onSelect: (merchantId: string) => void;
}

export function MerchantSearch({ onSelect }: MerchantSearchProps) {
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  const results = useMemo(() => {
    let list = query.trim() ? searchMerchants(query) : MERCHANTS;
    if (categoryFilter) list = list.filter((m) => m.categoryId === categoryFilter);
    return list;
  }, [query, categoryFilter]);

  // Categorías con conteo
  const categoryStats = useMemo(() => {
    return CATEGORIES.map((cat) => ({
      ...cat,
      count: MERCHANTS.filter((m) => m.categoryId === cat.id).length,
    })).filter((c) => c.count > 0);
  }, []);

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
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar comercio..."
          className="w-full rounded-2xl border border-line bg-bg-2 py-3.5 pl-11 pr-4 text-[15px] text-ink placeholder:text-ink-dim focus:border-lime focus:outline-none"
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

      {/* Category chips */}
      <div className="no-scrollbar mt-4 -mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
        <CategoryChip
          label="Todos"
          active={categoryFilter === null}
          onClick={() => setCategoryFilter(null)}
        />
        {categoryStats.map((cat) => (
          <CategoryChip
            key={cat.id}
            label={cat.label}
            emoji={cat.emoji}
            active={categoryFilter === cat.id}
            count={cat.count}
            onClick={() =>
              setCategoryFilter(categoryFilter === cat.id ? null : cat.id)
            }
          />
        ))}
      </div>

      {/* Results */}
      <div className="mt-5 space-y-2">
        {results.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line bg-bg-2/40 p-8 text-center">
            <div className="font-mono text-[10px] uppercase tracking-widest text-ink-dim">
              Sin resultados
            </div>
            <div className="mt-2 text-sm text-ink">
              {`No encontramos "${query}".`}
            </div>
            <div className="mt-1 text-xs text-ink-dim">
              Puede que aún no cubramos ese comercio.
            </div>
          </div>
        ) : (
          results.map((merchant) => (
            <MerchantRow
              key={merchant.id}
              merchant={merchant}
              onClick={() => onSelect(merchant.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

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

function MerchantRow({ merchant, onClick }: { merchant: Merchant; onClick: () => void }) {
  const category = getCategory(merchant.categoryId);
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-2xl border border-line bg-bg-2 p-4 text-left transition-all hover:border-lime hover:translate-x-1"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-bg-3 text-xl">
          {category?.emoji ?? "🛍️"}
        </div>
        <div>
          <div className="font-medium text-ink">{merchant.name}</div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-ink-dim">
            {category?.label}
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
