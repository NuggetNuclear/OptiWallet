"use client";

import { useMemo } from "react";
import { useRecommendations, useBanks } from "@/lib/hooks/use-api";
import { formatCLP, modalityLabel, formatDiscount } from "@/lib/format";
import { getBankVisual, type BankVisual } from "@/lib/bank-display";
import type { ApiRecommendation, ApiBank } from "@/lib/api-client";

interface TodaysFeedProps {
  cardIds: string[];
  date: Date;
  isToday: boolean;
  onMerchantClick: (merchantId: string) => void;
}

export function TodaysFeed({ cardIds, date, isToday, onMerchantClick }: TodaysFeedProps) {
  const { data: recs, loading } = useRecommendations(cardIds, date);
  const { data: banks } = useBanks();

  const bankMap = useMemo(() => {
    const m = new Map<string, ApiBank>();
    for (const b of banks) m.set(b.id, b);
    return m;
  }, [banks]);

  const bankInfo = (bankId: string): { name: string; visual: BankVisual } => {
    const b = bankMap.get(bankId);
    return { name: b?.short_name || b?.name || bankId, visual: getBankVisual(bankId, b?.name, b?.color) };
  };

  // Agrupar por merchant y quedarnos con la mejor promo por comercio
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
    return Array.from(map.values()).sort((a, b) => {
      const va = a.discount ?? a.discount_per_unit ?? 0;
      const vb = b.discount ?? b.discount_per_unit ?? 0;
      return vb - va;
    });
  }, [recs]);

  if (loading) {
    return (
      <div className="grid gap-3">
        <div className="h-44 animate-pulse rounded-[26px] bg-bg-3/60" />
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
        <p className="mt-2 text-sm text-ink-soft">
          Prueba otro día o busca un comercio específico más abajo.
        </p>
      </div>
    );
  }

  const [hero, ...rest] = byMerchant;
  const heroBank = bankInfo(hero.bank_id);

  return (
    <div className="grid gap-3">
      <HeroPromo rec={hero} bankName={heroBank.name} visual={heroBank.visual} onClick={() => onMerchantClick(hero.merchant_id)} />

      {rest.length > 0 && (
        <>
          <div className="mt-3 flex items-center gap-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-dim">
              — Más promos {isToday ? "hoy" : "este día"}
            </span>
            <div className="dashed-line flex-1" />
          </div>
          {rest.map((rec) => {
            const info = bankInfo(rec.bank_id);
            return (
              <FeedRow
                key={rec.merchant_id}
                rec={rec}
                bankName={info.name}
                visual={info.visual}
                onClick={() => onMerchantClick(rec.merchant_id)}
              />
            );
          })}
        </>
      )}
    </div>
  );
}

/** Card protagonista: la mejor promo del día entre las tarjetas del usuario. */
function HeroPromo({
  rec,
  bankName,
  visual,
  onClick,
}: {
  rec: ApiRecommendation;
  bankName: string;
  visual: BankVisual;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative w-full overflow-hidden rounded-[26px] p-5 text-left text-bg transition-transform active:scale-[0.99] sm:p-6"
      style={{
        background: "linear-gradient(135deg, #d4ff3a 0%, #a8d400 100%)",
        boxShadow: "0 24px 48px -24px rgba(212, 255, 58, 0.5)",
      }}
    >
      {/* Glows internos */}
      <div className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(255,255,255,0.35) 0%, transparent 70%)" }} />
      <div className="pointer-events-none absolute -left-12 -bottom-20 h-56 w-56 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(0,0,0,0.15) 0%, transparent 70%)" }} />

      <div className="relative">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-bg/70">
            <span className="h-1.5 w-1.5 rounded-full bg-bg/60" />
            Lo mejor de hoy
          </span>
          <span className="rounded-full bg-bg/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-bg">
            {modalityLabel(rec.modality as "presencial" | "online" | "both")}
          </span>
        </div>

        {/* Comercio */}
        <div className="mt-3 flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-bg/10 text-xl">
            {rec.emoji ?? "🛍️"}
          </span>
          <span className="break-words font-serif text-[26px] font-semibold leading-[1.0] tracking-[-0.02em] text-bg sm:text-[30px]">
            {rec.merchant_name}
          </span>
        </div>

        {/* Descuento gigante */}
        <div className="mt-4 flex flex-wrap items-baseline gap-x-2">
          <span className="font-serif text-[60px] font-bold leading-none tracking-[-0.04em] text-bg sm:text-[72px]">
            {formatDiscount(rec.discount, rec.discount_per_unit, rec.discount_unit)}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-widest text-bg/70">descuento</span>
        </div>

        {/* Paga con — branding de banco/tarjeta */}
        <div className="mt-5 flex items-center gap-2.5 rounded-2xl bg-bg/10 p-2.5">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg font-mono text-[11px] font-bold"
            style={{ backgroundColor: visual.color, color: visual.text }}
          >
            {visual.letter}
          </span>
          <div className="min-w-0">
            <div className="font-mono text-[9px] uppercase tracking-widest text-bg/60">Paga con</div>
            <div className="truncate text-sm font-semibold text-bg">{rec.card_name}</div>
          </div>
          <span className="ml-auto shrink-0 font-mono text-[10px] uppercase tracking-wider text-bg/70">{bankName}</span>
        </div>

        {/* Chips */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {rec.cap != null && <HeroChip>Tope {formatCLP(rec.cap)}</HeroChip>}
          {rec.min_purchase != null && <HeroChip>Desde {formatCLP(rec.min_purchase)}</HeroChip>}
          {rec.code && <HeroChip mono>Código {rec.code}</HeroChip>}
          {rec.stackable && <HeroChip>⚡ Apilable</HeroChip>}
        </div>
      </div>
    </button>
  );
}

function HeroChip({ children, mono }: { children: React.ReactNode; mono?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-bg/10 px-2.5 py-1 text-[11px] text-bg ${
        mono ? "font-mono text-[10px] uppercase tracking-wider" : ""
      }`}
    >
      {children}
    </span>
  );
}

function FeedRow({
  rec,
  bankName,
  visual,
  onClick,
}: {
  rec: ApiRecommendation;
  bankName: string;
  visual: BankVisual;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group relative flex w-full items-center gap-3 overflow-hidden rounded-2xl border border-line bg-bg-2 p-4 pl-3.5 text-left transition-all active:scale-[0.98] hover:border-line-strong hover:bg-bg-3/40"
    >
      {/* Acento de color de marca */}
      <span className="absolute inset-y-2 left-0 w-1 rounded-full" style={{ backgroundColor: visual.color }} />

      {/* Avatar del comercio */}
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-bg-3 text-xl">
        {rec.emoji ?? "🛍️"}
      </div>

      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-ink">{rec.merchant_name}</div>
        <div className="mt-1 flex items-center gap-1.5">
          <span
            className="flex h-4 shrink-0 items-center rounded px-1 font-mono text-[8px] font-bold tracking-wide"
            style={{ backgroundColor: visual.color, color: visual.text }}
          >
            {visual.letter}
          </span>
          <span className="truncate text-xs text-ink-soft">
            {rec.card_name}
            <span className="text-ink-dim"> · {modalityLabel(rec.modality as "presencial" | "online" | "both")}</span>
          </span>
        </div>
      </div>

      <div className="ml-2 shrink-0 text-right">
        <div className="font-serif text-[28px] font-semibold leading-none text-lime">
          {formatDiscount(rec.discount, rec.discount_per_unit, rec.discount_unit)}
        </div>
        {rec.cap != null && (
          <div className="mt-1 font-mono text-[9px] uppercase tracking-wider text-ink-dim">tope {formatCLP(rec.cap)}</div>
        )}
      </div>
    </button>
  );
}
