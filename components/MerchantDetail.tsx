"use client";

import { useMemo, useState } from "react"; // useMemo kept for applicableRecs
import { getCategory } from "@/lib/data/categories";
import { getMerchant } from "@/lib/data/merchants";
import { getPromotionsByMerchant } from "@/lib/data/promotions";
import { getBank } from "@/lib/data/banks";
import { getRecommendationsForMerchant } from "@/lib/recommendation-engine";
import { daysOfWeekLabel, formatCLP, modalityLabel } from "@/lib/format";
import { AlternativeCard, RecommendationCard } from "./RecommendationCard";
import type { Promotion } from "@/lib/types";


interface MerchantDetailProps {
  merchantId: string;
  cardIds: string[];
  date: Date;
  onClose: () => void;
  onAddCards: () => void;
}

export function MerchantDetail({
  merchantId,
  cardIds,
  date,
  onClose,
  onAddCards,
}: MerchantDetailProps) {
  const merchant = getMerchant(merchantId);
  const category = merchant ? getCategory(merchant.categoryId) : undefined;
  const allPromos = getPromotionsByMerchant(merchantId);

  const [amount, setAmount] = useState<number | undefined>(undefined);
  const [amountInput, setAmountInput] = useState("");

  const applicableRecs = useMemo(
    () => getRecommendationsForMerchant(merchantId, cardIds, date, amount),
    [merchantId, cardIds, date, amount],
  );

  const winner = applicableRecs[0];
  const alternatives = applicableRecs.slice(1);

  // notApplicable promos are rendered inline via the PromoRow isApplicable prop;

  if (!merchant) {
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
      <div
        className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-bg/90 px-5 backdrop-blur-xl"
        style={{
          paddingTop: "calc(var(--safe-top) + 14px)",
          paddingBottom: "14px",
        }}
      >
        <button
          onClick={onClose}
          className="flex items-center gap-2 text-sm text-ink transition-colors hover:text-lime"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M19 12H5m0 0l6-6m-6 6l6 6" />
          </svg>
          Volver
        </button>
        <span className="font-mono text-[10px] uppercase tracking-widest text-ink-dim">
          {allPromos.length} promo{allPromos.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="px-5 py-6 pb-24">
        {/* Hero del comercio */}
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-bg-3 text-3xl">
            {category?.emoji ?? "🛍️"}
          </div>
          <div>
            <h1 className="font-serif text-[32px] font-normal leading-none tracking-[-0.02em] text-ink">
              {merchant.name}
            </h1>
            <div className="mt-1.5 font-mono text-[11px] uppercase tracking-widest text-ink-dim">
              {category?.label}
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
        </div>

        {/* Ganadora o estado vacío */}
        {winner ? (
          <>
            <div className="mt-8">
              <SectionLabel>🏆 Mejor opción ahora</SectionLabel>
              <div className="mt-3">
                <RecommendationCard recommendation={winner} amount={amount} />
              </div>
            </div>

            {alternatives.length > 0 && (
              <div className="mt-8">
                <SectionLabel>Otras opciones aplicables</SectionLabel>
                <div className="mt-3 space-y-2">
                  {alternatives.map((rec) => (
                    <AlternativeCard key={rec.promotion.id} recommendation={rec} />
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="mt-8 rounded-2xl border border-dashed border-line bg-bg-2/40 p-6 text-center">
            <div className="font-serif text-xl text-ink">Hoy no hay promo para tus tarjetas aquí.</div>
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
            <SectionLabel>Todas las promos de {merchant.name}</SectionLabel>
            <div className="mt-3 space-y-2">
              {allPromos.map((promo) => (
                <PromoRow
                  key={promo.id}
                  promo={promo}
                  isWinner={winner?.promotion.id === promo.id}
                  isApplicable={applicableRecs.some((r) => r.promotion.id === promo.id)}
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
  promo: Promotion;
  isWinner: boolean;
  isApplicable: boolean;
}) {
  const bank = getBank(promo.bankId);
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
            <span className="font-medium text-ink">{bank?.name}</span>
            <span className="font-mono text-[9px] uppercase tracking-widest text-ink-dim">
              {promo.cardTypes.includes("credit") && promo.cardTypes.includes("debit")
                ? "Crédito/Débito"
                : promo.cardTypes.includes("credit")
                  ? "Crédito"
                  : "Débito"}
            </span>
          </div>
          <div className="mt-1 text-xs text-ink-dim">
            {daysOfWeekLabel(promo.daysOfWeek)} · {modalityLabel(promo.modality)}
            {promo.cap && <> · Tope {formatCLP(promo.cap)}</>}
          </div>
          {promo.code && (
            <div className="mt-1.5">
              <span className="inline-block rounded-md bg-bg-3 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-ink">
                {promo.code}
              </span>
            </div>
          )}
          {promo.startDate && promo.endDate && (
            <div className="mt-1 font-mono text-[10px] text-copper">
              Vigente {formatDate(promo.startDate)} — {formatDate(promo.endDate)}
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

function formatDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${parseInt(d, 10)}/${parseInt(m, 10)}`;
}

