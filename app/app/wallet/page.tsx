"use client";

// app/app/wallet/page.tsx — Gestión de wallet como ruta real (US-DL Sprint 2).
// Antes era `view === "wallet"` dentro de /app; ahora /app/wallet es
// deep-linkable y el botón back del browser funciona como se espera.

import { useRouter } from "next/navigation";
import { useWallet } from "@/lib/use-wallet";
import { WalletSetup } from "@/components/WalletSetup";
import { events } from "@/lib/analytics";

export default function WalletPage() {
  const router = useRouter();
  const { cardIds, hydrated, toggleCard, clearWallet } = useWallet();

  // Evita flash de estado vacío mientras hidrata localStorage
  if (!hydrated) return null;

  const goHome = () => router.push("/app");

  return (
    <WalletSetup
      mode="manage"
      selectedCardIds={cardIds}
      onToggleCard={toggleCard}
      onClearAll={clearWallet}
      onFinish={() => {
        events.walletUpdated(cardIds.length);
        goHome();
      }}
      onClose={goHome}
    />
  );
}
