import type { MerchantCategory } from "@/lib/types";

export const CATEGORIES: MerchantCategory[] = [
  { id: "comida-rapida", label: "Comida rápida", emoji: "🍔" },
  { id: "cafe", label: "Café", emoji: "☕" },
  { id: "pasteleria", label: "Pastelería", emoji: "🍰" },
  { id: "moda", label: "Moda y vestuario", emoji: "👕" },
  { id: "hogar", label: "Hogar y decoración", emoji: "🏠" },
  { id: "salud-belleza", label: "Salud y belleza", emoji: "💆" },
  { id: "mascotas", label: "Mascotas", emoji: "🐾" },
  { id: "vinos", label: "Vinos y licores", emoji: "🍷" },
  { id: "bebidas", label: "Bebidas", emoji: "🥤" },
  { id: "gas", label: "Gas y energía", emoji: "🔥" },
  { id: "libreria", label: "Librería", emoji: "📚" },
];

export function getCategory(id: string): MerchantCategory | undefined {
  return CATEGORIES.find((c) => c.id === id);
}
