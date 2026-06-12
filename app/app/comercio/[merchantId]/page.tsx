"use client";

// app/app/comercio/[merchantId]/page.tsx — Detalle de comercio como ruta
// real (US-DL Sprint 2). Deep-linkable: /app/comercio/jumbo?dia=2 muestra
// las promos de Jumbo para el próximo martes.

import { Suspense, useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useWallet } from "@/lib/use-wallet";
import { MerchantDetail } from "@/components/MerchantDetail";
import { useToday, effectiveDateFor, parseDiaParam } from "@/lib/hooks/use-today";
import { events } from "@/lib/analytics";

function MerchantContent() {
  const router = useRouter();
  const params = useParams<{ merchantId: string }>();
  const searchParams = useSearchParams();
  const { cardIds, hydrated } = useWallet();

  const merchantId = decodeURIComponent(params.merchantId);

  const today = useToday();
  const dia = parseDiaParam(searchParams.get("dia"));
  const effectiveDate = effectiveDateFor(today, dia ?? today.getDay());
  const diaQuery = dia === null ? "" : `?dia=${dia}`;

  useEffect(() => {
    events.merchantViewed(merchantId);
  }, [merchantId]);

  if (!hydrated) return null;

  return (
    <MerchantDetail
      merchantId={merchantId}
      cardIds={cardIds}
      date={effectiveDate}
      onClose={() => router.push(`/app${diaQuery}`)}
      onAddCards={() => router.push("/app/wallet")}
    />
  );
}

export default function MerchantPage() {
  return (
    <Suspense fallback={null}>
      <MerchantContent />
    </Suspense>
  );
}
