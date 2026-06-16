"use client";

// app/app/page.tsx — Home de la app (US-DL Sprint 2)
// Las vistas que antes eran estado React (`view`) ahora son rutas reales:
//   /app                    → home (esta página), día opcional vía ?dia=0..6
//   /app/wallet             → gestión de tarjetas
//   /app/comercio/[id]      → detalle de comercio
// El onboarding sigue siendo estado local: no es una vista navegable,
// es una condición de la wallet (vacía al hidratar).

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useWallet } from "@/lib/use-wallet";
import { Header } from "@/components/Header";
import { DayPicker } from "@/components/DayPicker";
import { TodaysFeed } from "@/components/TodaysFeed";
import { MerchantSearch } from "@/components/MerchantSearch";
import { WalletSetup } from "@/components/WalletSetup";
import { PageTransition } from "@/components/PageTransition";
import { formatDate, formatDayOfWeek } from "@/lib/format";
import { useToday, effectiveDateFor, parseDiaParam } from "@/lib/hooks/use-today";
import { events } from "@/lib/analytics";

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { cardIds, hydrated, initiallyEmpty, toggleCard, clearWallet } = useWallet();

  const today = useToday();
  const todayDow = today.getDay();

  // Día seleccionado vive en la URL (?dia=0..6) — deep-linkable y compartible.
  const selectedDay = parseDiaParam(searchParams.get("dia")) ?? todayDow;
  const setSelectedDay = useCallback(
    (d: number) => {
      router.replace(d === todayDow ? "/app" : `/app?dia=${d}`, { scroll: false });
    },
    [router, todayDow],
  );

  const effectiveDate = effectiveDateFor(today, selectedDay);
  const diaQuery = selectedDay === todayDow ? "" : `?dia=${selectedDay}`;

  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [transitionDone, setTransitionDone] = useState(false);

  // Orden de ambos listados (feed de promos + búsqueda de comercios). El sort es
  // client-side (las respuestas vienen cacheadas), así que el toggle no re-fetchea.
  // Default: popularidad primero (intención del ranking). Off = orden natural de
  // cada sección (descuento en el feed, alfabético en la búsqueda).
  const [sortByPopularity, setSortByPopularity] = useState(true);

  const handleTransitionComplete = useCallback(() => {
    setTransitionDone(true);
  }, []);

  // Métrica de onboarding: se dispara una sola vez cuando se muestra el setup
  const showOnboarding = hydrated && initiallyEmpty && !onboardingComplete;
  const onboardingTracked = useRef(false);
  useEffect(() => {
    if (showOnboarding && !onboardingTracked.current) {
      onboardingTracked.current = true;
      events.onboardingStarted();
    }
  }, [showOnboarding]);

  // Estado no hidratado o transición de llegada en curso: branded loading screen
  if (!hydrated || !transitionDone) {
    return (
      <PageTransition mode="arrive" onComplete={handleTransitionComplete} />
    );
  }

  // Onboarding obligatorio si la wallet estaba vacía al llegar y aún no se completa
  if (showOnboarding) {
    return (
      <WalletSetup
        selectedCardIds={cardIds}
        onToggleCard={toggleCard}
        onClearAll={clearWallet}
        onFinish={() => {
          events.onboardingCompleted(cardIds.length);
          setOnboardingComplete(true);
        }}
      />
    );
  }

  return (
    <div className="relative min-h-dvh page-content-enter">
      {/* Glows de fondo */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="glow-plum"
          style={{ top: "15%", right: "-30%", opacity: 0.35, zIndex: 0 }}
        />
        <div
          className="glow-lime"
          style={{ bottom: "0%", left: "-30%", opacity: 0.15, zIndex: 0 }}
        />
      </div>

      <Header
        onOpenWallet={() => router.push("/app/wallet")}
        onSearchClick={() => {
          document.getElementById('search-section')?.scrollIntoView({ behavior: 'smooth' });
        }}
        cardCount={cardIds.length}
      />

      <main className="relative z-10 px-5 pb-16 stagger-children">
        {/* Saludo + fecha */}
        <section className="pt-6">
          <div className="font-mono text-[11px] uppercase tracking-[0.15em] text-ink-dim">
            {selectedDay === todayDow
              ? formatDate(today)
              : formatDate(effectiveDate)}
          </div>
          <h1 className="mt-2 font-serif text-[32px] font-normal leading-[0.98] tracking-[-0.03em] text-ink sm:text-[52px]">
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

        {/* Toggle de orden — controla el feed y la búsqueda de comercios */}
        <section className="mt-7 flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-dim">
            Ordenar
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={sortByPopularity}
            onClick={() => setSortByPopularity((v) => !v)}
            className="inline-flex items-center gap-2 rounded-full border border-line bg-bg-2 px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-line-strong"
          >
            <span className={sortByPopularity ? "text-ink" : "text-ink-dim"}>
              Populares primero
            </span>
            <span
              className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${
                sortByPopularity ? "bg-lime" : "bg-bg-3"
              }`}
            >
              <span
                className={`absolute top-0.5 h-3 w-3 rounded-full bg-ink transition-all ${
                  sortByPopularity ? "left-3.5" : "left-0.5"
                }`}
              />
            </span>
          </button>
        </section>

        {/* Today's feed */}
        <section className="mt-5">
          <TodaysFeed
            cardIds={cardIds}
            date={effectiveDate}
            isToday={selectedDay === todayDow}
            sortByPopularity={sortByPopularity}
            onMerchantClick={(id) => {
              router.push(`/app/comercio/${encodeURIComponent(id)}${diaQuery}`);
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
        <section id="search-section" className="mt-5">
          <MerchantSearch
            sortByPopularity={sortByPopularity}
            onSelect={(id) => {
              router.push(`/app/comercio/${encodeURIComponent(id)}${diaQuery}`);
            }}
          />
        </section>

        {/* Footer / disclaimer */}
        <footer className="mt-16 border-t border-line pt-8">
          <div className="flex items-center gap-2">
            <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-lime" />
            <span className="font-mono text-[10px] uppercase tracking-widest text-ink-dim">
              OptiWallet v1.0.0-beta.1
            </span>
          </div>
          <p className="mt-3 max-w-lg text-xs leading-relaxed text-ink-dim">
            Las promociones cambian sin aviso; verifica condiciones antes de pagar.
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

// useSearchParams exige un boundary de Suspense para el prerender estático.
export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <HomeContent />
    </Suspense>
  );
}
