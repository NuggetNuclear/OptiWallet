"use client";

import { useMemo, useState } from "react";
import { useWallet } from "@/lib/use-wallet";
import { Header } from "@/components/Header";
import { DayPicker } from "@/components/DayPicker";
import { TodaysFeed } from "@/components/TodaysFeed";
import { MerchantSearch } from "@/components/MerchantSearch";
import { MerchantDetail } from "@/components/MerchantDetail";
import { WalletSetup } from "@/components/WalletSetup";
import { formatDate, formatDayOfWeek } from "@/lib/format";

type View = "home" | "merchant" | "wallet";

export default function HomePage() {
  const { cardIds, hydrated, isEmpty, toggleCard } = useWallet();

  const today = new Date();
  const todayDow = today.getDay();

  const [selectedDay, setSelectedDay] = useState<number>(todayDow);
  const [view, setView] = useState<View>("home");
  const [selectedMerchant, setSelectedMerchant] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Fecha efectiva para queries: si el día seleccionado no es hoy, usamos
  // la próxima ocurrencia de ese día de la semana. Para promos con rango
  // de fechas usamos la fecha real (no la simulada) — el usuario puede ver
  // "lo que aplica el martes" en general.
  const effectiveDate = useMemo(() => {
    if (selectedDay === todayDow) return today;
    const d = new Date(today);
    const diff = (selectedDay - todayDow + 7) % 7;
    d.setDate(d.getDate() + diff);
    return d;
  }, [selectedDay, todayDow, today]);

  // Estado no hidratado: evitamos pintar UI que dependa de localStorage
  if (!hydrated) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <div className="pulse-dot h-2 w-2 rounded-full bg-lime" />
      </div>
    );
  }

  // Onboarding obligatorio si wallet vacía y no ha sido saltado
  if (isEmpty && !showOnboarding) {
    return (
      <WalletSetup
        selectedCardIds={cardIds}
        onToggleCard={toggleCard}
        onFinish={() => setShowOnboarding(true)}
      />
    );
  }

  // Si decide gestionar wallet desde home
  if (view === "wallet") {
    return (
      <WalletSetup
        mode="manage"
        selectedCardIds={cardIds}
        onToggleCard={toggleCard}
        onFinish={() => setView("home")}
        onClose={() => setView("home")}
      />
    );
  }

  // Vista de comercio
  if (view === "merchant" && selectedMerchant) {
    return (
      <MerchantDetail
        merchantId={selectedMerchant}
        cardIds={cardIds}
        date={effectiveDate}
        onClose={() => {
          setView("home");
          setSelectedMerchant(null);
        }}
        onAddCards={() => setView("wallet")}
      />
    );
  }

  return (
    <div className="relative min-h-dvh">
      {/* Glows de fondo */}
      <div
        className="glow-plum"
        style={{ top: "15%", right: "-30%", opacity: 0.35, zIndex: 0 }}
      />
      <div
        className="glow-lime"
        style={{ bottom: "0%", left: "-30%", opacity: 0.15, zIndex: 0 }}
      />

      <Header
        onOpenWallet={() => setView("wallet")}
        cardCount={cardIds.length}
      />

      <main className="relative z-10 px-5 pb-16">
        {/* Saludo + fecha */}
        <section className="animate-fade-up pt-6">
          <div className="font-mono text-[11px] uppercase tracking-[0.15em] text-ink-dim">
            {formatDate(today)}
          </div>
          <h1 className="mt-2 font-serif text-[40px] font-normal leading-[0.95] tracking-[-0.03em] text-ink sm:text-[52px]">
            ¿Con qué pagas<br />
            <em className="font-light text-lime">
              {selectedDay === todayDow
                ? "hoy"
                : `el ${formatDayOfWeek(selectedDay).toLowerCase()}`}
              ?
            </em>
          </h1>
        </section>

        {/* Day picker */}
        <section className="mt-7">
          <DayPicker
            selected={selectedDay}
            today={todayDow}
            onSelect={setSelectedDay}
          />
        </section>

        {/* Today's feed */}
        <section className="mt-7">
          <TodaysFeed
            cardIds={cardIds}
            date={effectiveDate}
            isToday={selectedDay === todayDow}
            onMerchantClick={(id) => {
              setSelectedMerchant(id);
              setView("merchant");
            }}
          />
        </section>

        {/* Separador editorial */}
        <div className="mt-12 flex items-center gap-4">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-dim">
            — Buscar comercio
          </span>
          <div className="dashed-line flex-1" />
        </div>

        {/* Search */}
        <section className="mt-5">
          <MerchantSearch
            onSelect={(id) => {
              setSelectedMerchant(id);
              setView("merchant");
            }}
          />
        </section>

        {/* Footer / disclaimer */}
        <footer className="mt-16 border-t border-line pt-8">
          <div className="flex items-center gap-2">
            <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-lime" />
            <span className="font-mono text-[10px] uppercase tracking-widest text-ink-dim">
              OptiWallet v0.1.0-beta
            </span>
          </div>
          <p className="mt-3 max-w-lg text-xs leading-relaxed text-ink-dim">
            Datos cargados desde beneficios oficiales de BCI, abril 2026. Las
            promociones cambian sin aviso; verifica condiciones antes de pagar.
            OptiWallet no está afiliado a ningún banco.
          </p>
          <p className="mt-4 font-mono text-[10px] uppercase tracking-widest text-ink-dim">
            Hecho en Santiago · Chile 🇨🇱
          </p>
        </footer>
      </main>
    </div>
  );
}
