// lib/hooks/use-today.ts
// "Hoy" como estado compartido entre las rutas de /app.
// Una PWA puede quedar abierta días: se refresca al volver a la app
// (focus/visibilitychange) y cada minuto, actualizando solo cuando
// cambia el día calendario para no re-renderizar de más.

import { useEffect, useState } from "react";

export function useToday(): Date {
  const [today, setToday] = useState(() => new Date());

  useEffect(() => {
    const refresh = () => {
      setToday((prev) => {
        const now = new Date();
        return prev.toDateString() === now.toDateString() ? prev : now;
      });
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const interval = setInterval(refresh, 60_000);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      clearInterval(interval);
    };
  }, []);

  return today;
}

/**
 * Fecha efectiva para queries: si el día seleccionado no es hoy, usamos
 * la próxima ocurrencia de ese día de la semana.
 */
export function effectiveDateFor(today: Date, selectedDay: number): Date {
  const todayDow = today.getDay();
  if (selectedDay === todayDow) return today;
  const d = new Date(today);
  const diff = (selectedDay - todayDow + 7) % 7;
  d.setDate(d.getDate() + diff);
  return d;
}

/**
 * Parsea el searchParam `?dia=0..6`. Devuelve null si es inválido o ausente.
 */
export function parseDiaParam(value: string | null): number | null {
  if (value === null) return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= 6 ? n : null;
}
