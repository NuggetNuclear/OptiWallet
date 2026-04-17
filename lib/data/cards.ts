import type { Card } from "@/lib/types";

/**
 * Productos de tarjetas por banco.
 * En la beta los beneficios de BCI no distinguen entre tier de tarjeta (Gold, Black, etc.),
 * así que modelamos solo por tipo (crédito/débito).
 * Cuando sumemos otros bancos con promos específicas por producto, agregamos más cards acá.
 */
export const CARDS: Card[] = [
  { id: "bci-credit", bankId: "bci", name: "BCI Crédito", type: "credit" },
  { id: "bci-debit", bankId: "bci", name: "BCI Débito", type: "debit" },
];

export function getCard(id: string): Card | undefined {
  return CARDS.find((c) => c.id === id);
}

export function getCardsByBank(bankId: string): Card[] {
  return CARDS.filter((c) => c.bankId === bankId);
}
