"use client";

import { formatDayShort } from "@/lib/format";

interface DayPickerProps {
  selected: number; // 0-6
  today: number;
  onSelect: (day: number) => void;
}

const DAYS = [1, 2, 3, 4, 5, 6, 0]; // mostrar Lun primero, Dom último

export function DayPicker({ selected, today, onSelect }: DayPickerProps) {
  return (
    <div
      role="tablist"
      aria-label="Seleccionar día de la semana"
      className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 pb-1"
    >
      {DAYS.map((day) => {
        const isSelected = day === selected;
        const isToday = day === today;
        return (
          <button
            key={day}
            role="tab"
            aria-selected={isSelected}
            onClick={() => onSelect(day)}
            className={`relative flex min-w-[64px] shrink-0 flex-col items-center gap-1 rounded-2xl border px-3 py-3 transition-all ${
              isSelected
                ? "border-lime bg-lime text-bg"
                : "border-line bg-bg-2 text-ink hover:border-line-strong"
            }`}
          >
            <span className="font-mono text-[10px] uppercase tracking-widest opacity-70">
              {formatDayShort(day)}
            </span>
            <span className="font-serif text-xl font-semibold leading-none">
              {formatDayShort(day).charAt(0)}
            </span>
            {isToday && !isSelected && (
              <span className="absolute -top-1 right-2 h-1.5 w-1.5 rounded-full bg-lime" />
            )}
            {isToday && isSelected && (
              <span className="font-mono text-[9px] uppercase tracking-wide">hoy</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
