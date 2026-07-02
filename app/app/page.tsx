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
import {
  PageTransition,
  hasSeenAppTransition,
  markAppTransitionSeen,
} from "@/components/PageTransition";
import { formatDate, formatDayOfWeek } from "@/lib/format";
import { useToday, effectiveDateFor, parseDiaParam } from "@/lib/hooks/use-today";
import { events } from "@/lib/analytics";
import type { FeedSortBy } from "@/lib/constants";

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
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  // Splash "arrive" solo la primera entrada a /app por sesión: en montajes
  // posteriores (volver desde un comercio, re-abrir la tab) arranca listo.
  // En el server sessionStorage no existe → false, igual que el primer render
  // del cliente detrás del gate !hydrated: no hay mismatch de hidratación.
  const [transitionDone, setTransitionDone] = useState(() => hasSeenAppTransition());

  // Orden de ambos listados (feed de promos + búsqueda de comercios). El sort es
  // client-side (las respuestas vienen cacheadas), así que el select no re-fetchea.
  // Default: relevancia (el score compuesto del API — ver lib/constants.ts).
  const [sortBy, setSortBy] = useState<FeedSortBy>("relevance");

  const handleTransitionComplete = useCallback(() => {
    markAppTransitionSeen();
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
          setIsSearchOpen(true);
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
          <h1 className="mt-2 font-serif text-[26px] font-normal leading-[1.0] tracking-[-0.03em] text-ink sm:text-[40px]">
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

        {/* Selector de orden (rectángulo con menú desplegable) — controla el feed y la búsqueda de comercios */}
        <section className="mt-7 flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-dim">
            Ordenar
          </span>
          <div className="relative">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as FeedSortBy)}
              className="appearance-none rounded-xl border border-line bg-bg-2 py-2 pl-4 pr-10 text-xs font-medium text-ink transition-colors hover:border-line-strong focus:border-lime focus:outline-none cursor-pointer"
            >
              <option value="relevance">Relevancia</option>
              <option value="name">Nombre</option>
              <option value="popularity">Popularidad</option>
              <option value="discount">Descuento</option>
            </select>
            <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-dim">
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </div>
          </div>
        </section>

        {/* Today's feed */}
        <section className="mt-5">
          <TodaysFeed
            cardIds={cardIds}
            date={effectiveDate}
            isToday={selectedDay === todayDow}
            sortBy={sortBy}
            onMerchantClick={(id) => {
              router.push(`/app/comercio/${encodeURIComponent(id)}${diaQuery}`);
            }}
          />
        </section>



        {/* Footer / disclaimer */}
        <footer className="mt-16 border-t border-line pt-8">
          <div className="flex items-center gap-2">
            <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-lime" />
            <span className="font-mono text-[10px] uppercase tracking-widest text-ink-dim">
              OptiWallet v1.0.0-beta.2
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

      {isSearchOpen && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto overflow-x-hidden bg-bg/98 backdrop-blur-xl px-5 pb-10"
          style={{ paddingTop: "calc(var(--safe-top) + 20px)" }}
        >
          <MerchantSearch
            sortBy={sortBy}
            onClose={() => setIsSearchOpen(false)}
            onSelect={(id) => {
              setIsSearchOpen(false);
              router.push(`/app/comercio/${encodeURIComponent(id)}${diaQuery}`);
            }}
          />
        </div>
      )}
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
