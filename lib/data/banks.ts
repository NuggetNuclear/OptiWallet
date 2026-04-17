import type { Bank } from "@/lib/types";

/**
 * Bancos y emisores de tarjetas en el ecosistema chileno.
 * `available: false` = aún no tenemos promociones cargadas.
 * En la beta solo BCI tiene data real; el resto aparece como "próximamente".
 */
export const BANKS: Bank[] = [
  { id: "bci", name: "BCI", available: true },
  { id: "banco-chile", name: "Banco de Chile", available: false },
  { id: "santander", name: "Santander", available: false },
  { id: "scotiabank", name: "Scotiabank", available: false },
  { id: "itau", name: "Itaú", available: false },
  { id: "bancoestado", name: "BancoEstado", available: false },
  { id: "falabella", name: "Falabella / CMR", shortName: "Falabella", available: false },
  { id: "cencosud", name: "Cencosud", available: false },
  { id: "ripley", name: "Ripley", available: false },
  { id: "security", name: "Security", available: false },
  { id: "consorcio", name: "Consorcio", available: false },
  { id: "tenpo", name: "Tenpo", available: false },
  { id: "mach", name: "MACH", available: false },
  { id: "copec-pay", name: "Copec Pay", available: false },
];

export function getBank(id: string): Bank | undefined {
  return BANKS.find((b) => b.id === id);
}
