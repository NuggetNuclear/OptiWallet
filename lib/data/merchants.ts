import type { Merchant } from "@/lib/types";

export const MERCHANTS: Merchant[] = [
  // Comida rápida
  { id: "kfc", name: "KFC", categoryId: "comida-rapida" },
  { id: "papa-johns", name: "Papa John's", categoryId: "comida-rapida", aliases: ["papa jhons", "papajohns"] },
  { id: "wendys", name: "Wendy's", categoryId: "comida-rapida", aliases: ["wendys"] },
  { id: "chinawok", name: "Chinawok", categoryId: "comida-rapida", aliases: ["china wok"] },

  // Café
  { id: "juan-valdez", name: "Juan Valdez", categoryId: "cafe" },
  { id: "blackdrop", name: "Blackdrop Coffee", categoryId: "cafe", aliases: ["black drop"] },

  // Pastelería
  { id: "varsovienne", name: "Varsovienne", categoryId: "pasteleria" },
  { id: "mamut", name: "Mamut", categoryId: "pasteleria" },

  // Moda
  { id: "paula-benitez", name: "Paula Benítez", categoryId: "moda", aliases: ["paula benitez"] },
  { id: "scalpers", name: "Scalpers", categoryId: "moda" },
  { id: "flores", name: "Flores", categoryId: "moda" },
  { id: "pilgrim", name: "Pilgrim", categoryId: "moda" },
  { id: "totto", name: "Totto", categoryId: "moda", aliases: ["tottob"] },
  { id: "zig-zag", name: "Zig-Zag", categoryId: "moda", aliases: ["zigzag"] },
  { id: "lio-lo", name: "Lio Lo", categoryId: "moda", aliases: ["liolo"] },
  { id: "d-a", name: "D.A.", categoryId: "moda", aliases: ["da"] },

  // Hogar
  { id: "casaideas", name: "Casaideas", categoryId: "hogar", aliases: ["casa ideas"] },

  // Salud y belleza
  { id: "h-co", name: "H&CO", categoryId: "salud-belleza", aliases: ["hco", "h and co"] },
  { id: "bci-peluqueria", name: "Bci Peluquería", categoryId: "salud-belleza", aliases: ["peluqueria bci"] },
  { id: "portal-ortodoncia", name: "Portal de Ortodoncia de Chile", categoryId: "salud-belleza", aliases: ["ortodoncia"] },

  // Mascotas
  { id: "puppies-kittens", name: "Puppies & Kittens", categoryId: "mascotas", aliases: ["puppies and kittens"] },
  { id: "pet-vet", name: "Pet Vet", categoryId: "mascotas", aliases: ["petvet"] },

  // Vinos
  { id: "descorcha", name: "Descorcha.com", categoryId: "vinos", aliases: ["descorcha"] },

  // Bebidas
  { id: "mi-coca-cola", name: "Mi Coca-Cola", categoryId: "bebidas", aliases: ["coca cola", "cocacola"] },

  // Gas
  { id: "lipigas", name: "Lipigas", categoryId: "gas" },
];

export function getMerchant(id: string): Merchant | undefined {
  return MERCHANTS.find((m) => m.id === id);
}

export function getMerchantsByCategory(categoryId: string): Merchant[] {
  return MERCHANTS.filter((m) => m.categoryId === categoryId);
}

/**
 * Búsqueda fuzzy simple por nombre o alias.
 * Ignora tildes y mayúsculas. Suficiente para una lista de ~25 comercios.
 */
export function searchMerchants(query: string): Merchant[] {
  if (!query.trim()) return MERCHANTS;
  const normalized = normalize(query);
  return MERCHANTS.filter((m) => {
    const candidates = [m.name, ...(m.aliases ?? [])].map(normalize);
    return candidates.some((c) => c.includes(normalized));
  });
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}
