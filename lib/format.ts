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
