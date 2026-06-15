"use client";

import { useState } from "react";
import { useBanks, useCards } from "@/lib/hooks/use-api";
import type { ApiBank, ApiCard } from "@/lib/api-client";
import { TopBar } from "./layout/TopBar";
import { BottomDock } from "./layout/BottomDock";
import { BackButton } from "./layout/BackButton";

interface WalletSetupProps {
  selectedCardIds: string[];
  onToggleCard: (cardId: string) => void;
  onFinish: () => void;
  mode?: "onboarding" | "manage";
  onClose?: () => void;
  onClearAll?: () => void;
}

export function WalletSetup({
  selectedCardIds,
  onToggleCard,
  onFinish,
  mode = "onboarding",
  onClose,
  onClearAll,
}: WalletSetupProps) {
  const [expandedBank, setExpandedBank] = useState<string | null>(null);
  const hasSelection = selectedCardIds.length > 0;
  const isOnboarding = mode === "onboarding";

  const { data: banks, loading: banksLoading } = useBanks();
  const { data: allCards, loading: cardsLoading } = useCards();

  const getCardsByBank = (bankId: string): ApiCard[] =>
    allCards.filter((c) => c.bank_id === bankId);

  const loading = banksLoading || cardsLoading;

  return (
    <div className="relative min-h-dvh px-5 pb-40">
      {/* Glows decorativos */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="glow-plum" style={{ top: "-8%", right: "-20%", opacity: 0.4 }} />
        <div className="glow-lime" style={{ bottom: "10%", left: "-20%", opacity: 0.2 }} />
      </div>

      {mode === "manage" && onClose && (
        <TopBar
          variant="plain"
          flush
          left={<BackButton onClick={onClose} dim />}
          right={
            <span className="font-mono text-[10px] uppercase tracking-widest text-ink-dim">
              Mi wallet
            </span>
          }
        />
      )}

      <div
        className="relative z-10 animate-fade-up pt-12"
        style={isOnboarding ? { paddingTop: "calc(var(--safe-top) + 72px)" } : undefined}
      >
        {isOnboarding && (
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-lime px-3 py-1 font-mono text-[10px] uppercase tracking-[0.15em] text-lime">
            <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-lime" />
            Paso 1 de 1
          </div>
        )}

        <h1 className="font-serif text-[34px] font-normal leading-[0.98] tracking-[-0.03em] text-ink sm:text-[52px]">
          {isOnboarding ? (
            <>
              Arma tu<br />
              <em className="font-light text-lime">wallet.</em>
            </>
          ) : (
            <>
              Tus <em className="font-light text-lime">tarjetas.</em>
            </>
          )}
        </h1>

        <p className="mt-4 max-w-md text-base leading-relaxed text-ink-dim">
          {isOnboarding ? (
            <>
              Marca las tarjetas que tienes. <span className="text-ink">Solo el nombre</span>, nunca el número ni la clave. Así sabemos qué promos aplican para ti.
            </>
          ) : (
            <>Agrega o quita tarjetas cuando quieras. Los cambios son instantáneos.</>
          )}
        </p>

        <div className="mt-10 space-y-3">
          {loading
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="animate-pulse rounded-2xl border border-line bg-bg-2 p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-bg-3" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-28 rounded bg-bg-3" />
                      <div className="h-3 w-20 rounded bg-bg-3" />
                    </div>
                  </div>
                </div>
              ))
            : banks.map((bank) => (
                <BankRow
                  key={bank.id}
                  bank={bank}
                  expanded={expandedBank === bank.id}
                  onExpand={() => setExpandedBank(expandedBank === bank.id ? null : bank.id)}
                  selectedCardIds={selectedCardIds}
                  onToggleCard={onToggleCard}
                  cards={getCardsByBank(bank.id)}
                />
              ))}
        </div>

        <p className="mt-8 font-mono text-[10px] uppercase tracking-widest text-ink-dim">
          — Sumamos bancos cada semana —
        </p>
      </div>

      {/* CTA flotante */}
      <BottomDock>
        {hasSelection && onClearAll && (
          <button
            onClick={onClearAll}
            className="mx-auto mb-2 flex items-center gap-1.5 rounded-full border border-line px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-ink-dim transition-colors hover:border-red-400 hover:text-red-400"
            aria-label="Limpiar todas las tarjetas"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
            Limpiar todo
          </button>
        )}
        <button
          onClick={onFinish}
          disabled={!hasSelection}
          className="btn-primary"
        >
          {hasSelection ? (
            <>
              {isOnboarding ? "Continuar" : "Guardar"}
              <span className="font-mono text-xs opacity-70">
                · {selectedCardIds.length} tarjeta{selectedCardIds.length > 1 ? "s" : ""}
              </span>
            </>
          ) : (
            "Elige al menos una tarjeta"
          )}
        </button>
      </BottomDock>
    </div>
  );
}

function BankRow({
  bank,
  expanded,
  onExpand,
  selectedCardIds,
  onToggleCard,
  cards,
}: {
  bank: ApiBank;
  expanded: boolean;
  onExpand: () => void;
  selectedCardIds: string[];
  onToggleCard: (id: string) => void;
  cards: ApiCard[];
}) {
  const hasSelected = cards.some((c) => selectedCardIds.includes(c.id));

  // Unique abbreviations and brand-inspired colors per bank.
  // Fallback: first 2 chars of name + neutral bg.
  const BANK_DISPLAY: Record<string, { letter: string; bg: string }> = {
    "bice":          { letter: "BI",  bg: "#003087" },
    "falabella":     { letter: "FB",  bg: "#8CC63F" },
    "ripley":        { letter: "RP",  bg: "#6B2D8B" },
    "santander":     { letter: "SA",  bg: "#EC0000" },
    "security":      { letter: "SE",  bg: "#1A3D6D" },
    "bco-chile":     { letter: "BC",  bg: "#003A70" },
    "bci":           { letter: "BCI", bg: "#0033A0" },
    "banco-estado":  { letter: "BE",  bg: "#002D72" },
    "itau":          { letter: "IU",  bg: "#FF6600" },
    "mach":          { letter: "MA",  bg: "#6C5CE7" },
    "mercado-pago":  { letter: "MP",  bg: "#009EE3" },
    "scotiabank":    { letter: "SB",  bg: "#EC1C24" },
    "tenpo":         { letter: "TP",  bg: "#00C389" },
    "coopeuch":      { letter: "CO",  bg: "#E4002B" },
  };

  const display = BANK_DISPLAY[bank.id];
  const iconLetter = display?.letter ?? bank.name.slice(0, 2).toUpperCase();
  const iconBg = hasSelected ? undefined : (bank.color ?? display?.bg);

  return (
    <div
      className={`overflow-hidden rounded-2xl border transition-colors ${
        expanded ? "border-line-strong" : "border-line"
      } ${hasSelected ? "border-lime" : ""} ${!bank.available ? "opacity-50" : ""}`}
    >
      <button
        onClick={() => bank.available && onExpand()}
        disabled={!bank.available}
        className="flex w-full items-center justify-between p-4 text-left"
      >
        <div className="flex items-center gap-3">
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-xl font-mono text-[11px] font-bold tracking-wide ${
              hasSelected ? "bg-lime text-bg" : "text-white"
            }`}
            style={!hasSelected && iconBg ? { backgroundColor: iconBg } : !hasSelected ? { backgroundColor: "var(--bg-3)", color: "var(--ink)" } : undefined}
          >
            {iconLetter}
          </div>
          <div>
            <div className="font-medium text-ink">{bank.name}</div>
            {!bank.available && (
              <div className="font-mono text-[10px] uppercase tracking-widest text-ink-dim">
                Próximamente
              </div>
            )}
            {hasSelected && (
              <div className="font-mono text-[10px] uppercase tracking-widest text-lime">
                {cards.filter((c) => selectedCardIds.includes(c.id)).length} seleccionada{
                  cards.filter((c) => selectedCardIds.includes(c.id)).length > 1 ? "s" : ""
                }
              </div>
            )}
          </div>
        </div>
        {bank.available && (
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            className={`text-ink-dim transition-transform ${expanded ? "rotate-180" : ""}`}
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        )}
      </button>

      {expanded && bank.available && cards.length > 0 && (
        <div className="border-t border-line bg-bg-2/50 p-3">
          <div className="grid gap-2">
            {cards.map((card) => {
              const checked = selectedCardIds.includes(card.id);
              return (
                <label
                  key={card.id}
                  className={`flex cursor-pointer items-center justify-between rounded-xl border p-3 transition-colors ${
                    checked ? "border-lime bg-lime/5" : "border-line bg-bg-2 hover:border-line-strong"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-5 w-5 items-center justify-center rounded-md border-2 transition-colors ${
                        checked ? "border-lime bg-lime" : "border-line-strong"
                      }`}
                    >
                      {checked && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#0b0d0c" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-ink">{card.name}</div>
                      <div className="font-mono text-[10px] uppercase tracking-widest text-ink-dim">
                        {card.type === "credit" ? "Crédito" : card.type === "debit" ? "Débito" : "Prepago"}
                      </div>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggleCard(card.id)}
                    className="sr-only"
                  />
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
