"use client";

import { useMemo, useState } from "react";
import { useRecommendations, usePromotions, useMerchantFromApi } from "@/lib/hooks/use-api";
import { daysOfWeekLabel, formatCLP, modalityLabel } from "@/lib/format";
import { AlternativeCard, RecommendationCard } from "./RecommendationCard";
import { TopBar } from "./layout/TopBar";
import { BackButton } from "./layout/BackButton";
import type { ApiRecommendation, ApiPromotion } from "@/lib/api-client";
import { rankRecommendations } from "@/lib/recommendations";


interface MerchantDetailProps {
  merchantId: string;
  cardIds: string[];
  date: Date;
  isToday: boolean;
  selectedDayName: string;
  onClose: () => void;
  onAddCards: () => void;
}

/**
 * Adapt an ApiRecommendation into the shape expected by RecommendationCard.
 */
function toRecCardShape(rec: ApiRecommendation, bankName: string) {
  return {
    promotion: {
      id: rec.promotion_id,
      discount: rec.discount,
      discount_per_unit: rec.discount_per_unit,
      discount_unit: rec.discount_unit,
      stackable: rec.stackable,
      cap: rec.cap,
      min_purchase: rec.min_purchase,
      modality: rec.modality,
      code: rec.code,
      conditions: rec.conditions,
    },
    card: {
      name: rec.card_name,
      type: rec.card_type,
      bankId: rec.bank_id,
    },
    merchant: {
      name: rec.merchant_name,
    },
    bankName,
  };
}

/**
 * We need a bank name per recommendation. The /api/banks data isn't needed —
 * we can derive bank names from either the promotions response (which has bank_name)
 * or by maintaining a small map. For recommendations, the bank_id is present but
 * bank_name isn't directly on the recommendations response.
 * We'll use the promotions data (which has bank_name) to build the map.
 */
function buildBankNameMap(promos: ApiPromotion[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const p of promos) {
    if (!map.has(p.bank_id)) map.set(p.bank_id, p.bank_name);
  }
  return map;
}

export function MerchantDetail({
  merchantId,
  cardIds,
  date,
  isToday,
  selectedDayName,
  onClose,
  onAddCards,
}: MerchantDetailProps) {
  const { data: merchantData, loading: merchantLoading } = useMerchantFromApi(merchantId);
  const { data: allPromos, loading: promosLoading } = usePromotions(merchantId);

  const [amount, setAmount] = useState<number | undefined>(undefined);
  const [amountInput, setAmountInput] = useState("");
  const [units, setUnits] = useState<number | undefined>(undefined);
  const [unitsInput, setUnitsInput] = useState("");

  const { data: applicableRecs, loading: recsLoading } = useRecommendations(
    cardIds,
    date,
    merchantId,
  );

  const bankNameMap = useMemo(() => buildBankNameMap(allPromos), [allPromos]);
  const getBankName = (bankId: string) => bankNameMap.get(bankId) ?? bankId;

  // Detectar si hay promos de tipo por-litro
  const hasPerUnitPromos = useMemo(
    () => applicableRecs.some((r) => r.discount_unit === "liter"),
    [applicableRecs]
  );

  // Ordenar dinámicamente las recomendaciones basándose en el monto/litros ingresados
  const rankedRecs = useMemo(() => {
    return rankRecommendations(applicableRecs, amount, units);
  }, [applicableRecs, amount, units]);

  const winner = rankedRecs[0];
  const alternatives = winner
    ? rankedRecs.slice(1).filter(
        (rec) => rec.promotion_id !== winner.promotion_id || rec.card_id !== winner.card_id
      )
    : [];

  const loading = merchantLoading || promosLoading || recsLoading;

  if (loading) {
    return (
      <div className="relative min-h-dvh bg-bg">
        {/* Header skeleton */}
        <TopBar left={<BackButton onClick={onClose} />} />
        <div className="px-5 py-6 space-y-4">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 animate-pulse rounded-2xl bg-bg-3" />
            <div className="flex-1 space-y-2">
              <div className="h-7 w-40 animate-pulse rounded bg-bg-3" />
              <div className="h-3 w-24 animate-pulse rounded bg-bg-3" />
            </div>
          </div>
          <div className="h-28 animate-pulse rounded-2xl bg-bg-3/60" />
          <div className="h-48 animate-pulse rounded-[24px] bg-bg-3/60" />
        </div>
      </div>
    );
  }

  if (!merchantData) {
    return (
      <div className="p-5">
        <p>Comercio no encontrado.</p>
        <button onClick={onClose} className="mt-4 btn-ghost">
          Volver
        </button>
      </div>
    );
  }

  return (
    <div className="relative min-h-dvh bg-bg">
      {/* Header */}
      <TopBar
        left={<BackButton onClick={onClose} />}
        right={
          <span className="font-mono text-[10px] uppercase tracking-widest text-ink-dim">
            {allPromos.length} promo{allPromos.length !== 1 ? "s" : ""}
          </span>
        }
      />

      <div className="px-5 py-6 pb-24">
        {/* Hero del comercio */}
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-bg-3 text-3xl">
            {merchantData.emoji ?? "🛍️"}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="break-words font-serif text-[26px] font-normal leading-[1.05] tracking-[-0.02em] text-ink sm:text-[32px] sm:leading-none">
              {merchantData.name}
            </h1>
            <div className="mt-1.5 font-mono text-[11px] uppercase tracking-widest text-ink-dim">
              {merchantData.category_label}
            </div>
          </div>
        </div>

        {/* Input de monto */}
        <div className="mt-6 rounded-2xl border border-line bg-bg-2 p-4">
          <label className="block font-mono text-[10px] uppercase tracking-widest text-ink-dim">
            ¿Cuánto vas a gastar? <span className="opacity-60">(opcional)</span>
          </label>
          <div className="mt-2 flex items-center gap-2">
            <span className="font-serif text-2xl text-ink-dim">$</span>
            <input
              type="text"
              inputMode="numeric"
              placeholder="50.000"
              value={amountInput}
              onChange={(e) => {
                const raw = e.target.value.replace(/\D/g, "");
                setAmountInput(raw ? Number(raw).toLocaleString("es-CL") : "");
                setAmount(raw ? Number(raw) : undefined);
              }}
              className="flex-1 bg-transparent font-serif text-2xl text-ink placeholder:text-ink-dim/50 focus:outline-none"
            />
            {amountInput && (
              <button
                onClick={() => {
                  setAmountInput("");
                  setAmount(undefined);
                }}
                className="text-xs text-ink-dim hover:text-ink"
              >
                limpiar
              </button>
            )}
          </div>
          <p className="mt-2 text-[11px] text-ink-dim">
            Así calculamos el ahorro real considerando el tope de cada promo.
          </p>

          {/* Input de litros (solo si hay promos de tipo por-litro) */}
          {hasPerUnitPromos && (
            <>
              <div className="mt-4 border-t border-line pt-4">
                <label className="block font-mono text-[10px] uppercase tracking-widest text-ink-dim">
                  ¿Cuántos litros vas a cargar? <span className="opacity-60">(para descuentos $X/L)</span>
                </label>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="40"
                    value={unitsInput}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/\D/g, "");
                      setUnitsInput(raw);
                      setUnits(raw ? Number(raw) : undefined);
                    }}
                    className="flex-1 bg-transparent font-serif text-2xl text-ink placeholder:text-ink-dim/50 focus:outline-none"
                  />
                  <span className="font-mono text-sm text-ink-dim">L</span>
                  {unitsInput && (
                    <button
                      onClick={() => { setUnitsInput(""); setUnits(undefined); }}
                      className="text-xs text-ink-dim hover:text-ink"
                    >
                      limpiar
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Ganadora o estado vacío */}
        {winner ? (
          <>
            <div className="mt-8">
              <SectionLabel>🏆 Mejor opción ahora</SectionLabel>
              <div className="mt-3">
                <RecommendationCard
                  recommendation={toRecCardShape(winner, getBankName(winner.bank_id))}
                  amount={amount}
                  units={units}
                />
              </div>
            </div>

            {alternatives.length > 0 && (
              <div className="mt-8">
                <SectionLabel>Otras opciones aplicables</SectionLabel>
                <div className="mt-3 space-y-2">
                  {alternatives.map((rec) => (
                    <AlternativeCard
                      key={`${rec.promotion_id}:${rec.card_id}`}
                      recommendation={toRecCardShape(rec, getBankName(rec.bank_id))}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="mt-8 rounded-2xl border border-dashed border-line bg-bg-2/40 p-6 text-center">
            <div className="font-serif text-xl text-ink">{isToday ? "Hoy" : `El ${selectedDayName}`} no hay promo para tus tarjetas aquí.</div>
            <p className="mt-2 text-sm text-ink-dim">
              {cardIds.length === 0
                ? "Agrega tus tarjetas para ver recomendaciones."
                : "Revisa otro día o agrega más tarjetas a tu wallet."}
            </p>
            {cardIds.length === 0 && (
              <button onClick={onAddCards} className="mt-4 btn-primary max-w-xs mx-auto">
                Agregar tarjetas
              </button>
            )}
          </div>
        )}

        {/* Todas las promos existentes */}
        {allPromos.length > 0 && (
          <div className="mt-10">
            <SectionLabel>Todas las promos de {merchantData.name}</SectionLabel>
            <div className="mt-3 space-y-2">
              {allPromos.map((promo) => (
                <PromoRow
                  key={promo.id}
                  promo={promo}
                  isWinner={winner?.promotion_id === promo.id}
                  isApplicable={applicableRecs.some((r) => r.promotion_id === promo.id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Disclaimer */}
        <div className="mt-10 rounded-xl border border-line bg-bg-2/40 p-4">
          <div className="font-mono text-[10px] uppercase tracking-widest text-copper">
            Verifica antes de pagar
          </div>
          <p className="mt-1.5 text-[12px] leading-relaxed text-ink-dim">
            Las promociones pueden cambiar sin aviso. Siempre confirma condiciones,
            vigencia y tope directamente con el banco o el comercio antes de la compra.
          </p>
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-mono text-[11px] uppercase tracking-[0.15em] text-ink-dim">
      {children}
    </h2>
  );
}

function PromoRow({
  promo,
  isWinner,
  isApplicable,
}: {
  promo: ApiPromotion;
  isWinner: boolean;
  isApplicable: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        isWinner
          ? "border-lime bg-lime/5"
          : isApplicable
            ? "border-line-strong bg-bg-2"
            : "border-line bg-bg-2/50 opacity-60"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-ink">{promo.bank_name}</span>
            <span className="font-mono text-[9px] uppercase tracking-widest text-ink-dim">
              {(() => {
                const parts: string[] = [];
                if (promo.card_types.includes("credit")) parts.push("Crédito");
                if (promo.card_types.includes("debit")) parts.push("Débito");
                if (promo.card_types.includes("prepaid")) parts.push("Prepago");
                return parts.join("/");
              })()}
            </span>
          </div>
          <div className="mt-1 text-xs text-ink-dim">
            {daysOfWeekLabel(promo.days_of_week)} · {modalityLabel(promo.modality as "presencial" | "online" | "both")}
            {promo.cap && <> · Tope {formatCLP(promo.cap)}</>}
          </div>
          {promo.code && (
            <div className="mt-1.5">
              <span className="inline-block rounded-md bg-bg-3 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-ink">
                {promo.code}
              </span>
            </div>
          )}
          {(promo.start_date || promo.end_date) && (
            <div className="mt-1 font-mono text-[10px] text-copper">
              {promo.start_date && promo.end_date
                ? `Vigente ${formatIsoDate(promo.start_date)} — ${formatIsoDate(promo.end_date)}`
                : promo.start_date
                  ? `Desde ${formatIsoDate(promo.start_date)}`
                  : `Hasta ${formatIsoDate(promo.end_date!)}`}
            </div>
          )}
          {promo.conditions && (
            <div className="mt-1 text-[11px] italic text-ink-dim">{promo.conditions}</div>
          )}
        </div>
        <div className="text-right">
          <div className="font-serif text-2xl font-semibold leading-none text-ink">
            {promo.discount}%
          </div>
        </div>
      </div>
    </div>
  );
}

function formatIsoDate(iso: string): string {
  // Handle ISO strings like "2026-04-20T04:00:00.000Z"
  const dateStr = iso.split("T")[0];
  const [y, m, d] = dateStr.split("-");
  const currentYear = new Date().getFullYear();
  const year = parseInt(y, 10);
  // Include year when the promotion date is in a different year
  if (year !== currentYear) {
    return `${parseInt(d, 10)}/${parseInt(m, 10)}/${y}`;
  }
  return `${parseInt(d, 10)}/${parseInt(m, 10)}`;
}
