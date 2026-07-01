const DIAS = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
];

const DIAS_CORTO = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/**
 * Fecha como "YYYY-MM-DD" en hora LOCAL del dispositivo.
 * Nunca usar `toISOString()` para esto: es UTC, y en Chile (UTC-3/-4)
 * desde las ~21:00 ya es "mañana" en UTC — mostraría las promos del día
 * siguiente como si fueran de hoy.
 */
export function toISODateLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatDayOfWeek(day: number): string {
  return DIAS[day] ?? "";
}

export function formatDayShort(day: number): string {
  return DIAS_CORTO[day] ?? "";
}

export function formatDate(date: Date): string {
  return `${DIAS[date.getDay()]} · ${date.getDate()} de ${MESES[date.getMonth()]}`;
}

export function formatDateShort(date: Date): string {
  return `${date.getDate()} ${MESES[date.getMonth()].slice(0, 3)}`;
}

/**
 * Formato de moneda chilena: $12.500, $1.250.000
 */
export function formatCLP(amount: number): string {
  return "$" + amount.toLocaleString("es-CL");
}

export function daysOfWeekLabel(days: number[]): string {
  if (days.length === 0) return "Todos los días";
  if (days.length === 1) return DIAS[days[0]];
  if (days.length === 7) return "Todos los días";
  return days.map((d) => DIAS_CORTO[d]).join(", ");
}

export function modalityLabel(modality: "presencial" | "online" | "both"): string {
  if (modality === "both") return "Online y presencial";
  if (modality === "online") return "Online";
  return "Presencial";
}

/**
 * Formatea un descuento para mostrar al usuario, sin importar el tipo.
 * Ej: porcentaje → "15%"  |  por litro → "$100/L"
 */
export function formatDiscount(
  discount: number | null,
  discountPerUnit: number | null,
  discountUnit: string | null
): string {
  if (discountPerUnit !== null && discountUnit === "liter") {
    return `${formatCLP(discountPerUnit)}/L`;
  }
  // Guard against a null discount rendering literally as "null%".
  return `${discount ?? 0}%`;
}
