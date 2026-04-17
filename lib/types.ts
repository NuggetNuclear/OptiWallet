/**
 * Tipos de dominio de OptiWallet.
 * Diseñados para mapearse 1:1 a tablas PostgreSQL cuando llegue el backend.
 */

export type CardType = "credit" | "debit";

export type Modality = "presencial" | "online" | "both";

export interface Bank {
  id: string;
  name: string;
  shortName?: string;
  available: boolean; // false = próximamente, sin data cargada
}

export interface Card {
  id: string;
  bankId: string;
  name: string; // "BCI Crédito", "Santander Black", etc.
  type: CardType;
}

export interface MerchantCategory {
  id: string;
  label: string;
  emoji: string;
}

export interface Merchant {
  id: string;
  name: string;
  categoryId: string;
  aliases?: string[]; // para autocompletado fuzzy
}

export interface Promotion {
  id: string;
  bankId: string;
  cardTypes: CardType[]; // qué tipos aplican (credit, debit o ambos)
  merchantId: string;

  discount: number; // porcentaje 0-100
  cap: number | null; // tope en CLP, null = sin tope

  /**
   * Días de la semana en que aplica.
   * 0 = domingo, 1 = lunes, ..., 6 = sábado.
   * Array vacío = todos los días.
   */
  daysOfWeek: number[];

  startDate?: string; // ISO yyyy-mm-dd, opcional (promo con fecha de inicio)
  endDate?: string; // ISO yyyy-mm-dd, opcional (promo con vencimiento)

  modality: Modality;
  code?: string; // código a ingresar al pagar
  conditions?: string;

  source: string; // referencia al origen (ej: "BCI beneficios abril 2026")
  verifiedAt: string; // ISO date
}

export interface Recommendation {
  promotion: Promotion;
  card: Card;
  merchant: Merchant;
  estimatedSavings?: number; // si se conoce el monto
  reasonsNotApplicable?: string[]; // si se muestra como no aplicable
}
