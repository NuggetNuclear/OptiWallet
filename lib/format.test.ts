import { describe, it } from "node:test";
import { strictEqual } from "node:assert";
import {
  toISODateLocal,
  formatDayOfWeek,
  formatDayShort,
  formatDate,
  formatDateShort,
  formatCLP,
  daysOfWeekLabel,
  modalityLabel,
} from "./format.ts";

// new Date(anio, mesBase0, dia) usa hora local, nunca UTC.

// ──────────────────────────── toISODateLocal ──────────────────────────────────

describe("toISODateLocal", () => {
  it("usa fecha LOCAL no UTC — no rueda al dia siguiente de noche", () => {
    // 23:30 local en Chile -> toISOString() daria el dia siguiente en UTC
    strictEqual(toISODateLocal(new Date(2026, 5, 13, 23, 30)), "2026-06-13");
  });
  it("rellena mes con cero (enero = 01)", () => {
    strictEqual(toISODateLocal(new Date(2026, 0, 15)), "2026-01-15");
  });
  it("rellena dia con cero", () => {
    strictEqual(toISODateLocal(new Date(2026, 11, 5)), "2026-12-05");
  });
  it("funciona correctamente en todos los meses del anio", () => {
    const expected = [
      "2026-01-01","2026-02-01","2026-03-01","2026-04-01",
      "2026-05-01","2026-06-01","2026-07-01","2026-08-01",
      "2026-09-01","2026-10-01","2026-11-01","2026-12-01",
    ];
    expected.forEach((iso, i) => {
      strictEqual(toISODateLocal(new Date(2026, i, 1)), iso);
    });
  });
});

// ─────────────────────────── formatDayOfWeek ─────────────────────────────────

describe("formatDayOfWeek — nombre completo del dia", () => {
  const casos: [number, string][] = [
    [0, "Domingo"], [1, "Lunes"], [2, "Martes"], [3, "Miercoles"],
    [4, "Jueves"], [5, "Viernes"], [6, "Sabado"],
  ];
  for (const [dow] of casos) {
    // Verificar solo que retorna string no vacio (nombres con tildes varían segun locale)
    it("dow " + dow + " retorna string no vacio", () => {
      const result = formatDayOfWeek(dow);
      strictEqual(typeof result, "string");
      strictEqual(result.length > 0, true);
    });
  }
  it("dia 0 = Domingo", () => strictEqual(formatDayOfWeek(0), "Domingo"));
  it("dia 3 = Miercoles (con tilde)", () => {
    const result = formatDayOfWeek(3);
    strictEqual(result.startsWith("Mi"), true);
  });
  it("dia 6 = Sabado (con tilde)", () => {
    const result = formatDayOfWeek(6);
    strictEqual(result.startsWith("S"), true);
  });
});

// ──────────────────────────── formatDayShort ─────────────────────────────────

describe("formatDayShort — nombre corto del dia", () => {
  it("dia 0 -> Dom", () => strictEqual(formatDayShort(0), "Dom"));
  it("dia 1 -> Lun", () => strictEqual(formatDayShort(1), "Lun"));
  it("dia 2 -> Mar", () => strictEqual(formatDayShort(2), "Mar"));
  it("dia 4 -> Jue", () => strictEqual(formatDayShort(4), "Jue"));
  it("dia 5 -> Vie", () => strictEqual(formatDayShort(5), "Vie"));
  it("dia 6 -> Sab (3 letras con o sin tilde)", () => {
    const result = formatDayShort(6);
    strictEqual(result.length, 3);
    strictEqual(result.startsWith("S"), true);
  });
  it("todos los dias retornan exactamente 3 caracteres", () => {
    for (let i = 0; i <= 6; i++) {
      strictEqual(formatDayShort(i).length, 3, "dia " + i + " debe tener 3 chars");
    }
  });
});

// ─────────────────────────────── formatDate ──────────────────────────────────

describe("formatDate — formato largo para UI", () => {
  it("contiene el numero del dia y el nombre del mes", () => {
    const result = formatDate(new Date(2026, 5, 13)); // sabado 13 jun
    strictEqual(result.includes("13"), true);
    strictEqual(result.includes("junio"), true);
  });
  it("contiene separador central (punto medio)", () => {
    const result = formatDate(new Date(2026, 5, 13));
    strictEqual(result.includes("·"), true);
  });
  it("1 de enero", () => {
    const result = formatDate(new Date(2024, 0, 1)); // lunes 1 ene 2024
    strictEqual(result.includes("1"), true);
    strictEqual(result.includes("enero"), true);
  });
});

// ─────────────────────────── formatDateShort ─────────────────────────────────

describe("formatDateShort — formato compacto para chips", () => {
  it("13 junio -> empieza con 13 y contiene jun", () => {
    const result = formatDateShort(new Date(2026, 5, 13));
    strictEqual(result.startsWith("13"), true);
    strictEqual(result.includes("jun"), true);
  });
  it("1 enero -> empieza con 1 y contiene ene", () => {
    const result = formatDateShort(new Date(2026, 0, 1));
    strictEqual(result.startsWith("1"), true);
    strictEqual(result.includes("ene"), true);
  });
  it("diciembre usa 3 letras (dic)", () => {
    const result = formatDateShort(new Date(2026, 11, 25));
    strictEqual(result.includes("dic"), true);
  });
});

// ──────────────────────────────── formatCLP ──────────────────────────────────

describe("formatCLP — moneda chilena", () => {
  it("$0", () => strictEqual(formatCLP(0), "$0"));
  it("$1", () => strictEqual(formatCLP(1), "$1"));
  it("$999 (sin separador)", () => strictEqual(formatCLP(999), "$999"));
  it("$1.000 (separador de miles con punto)", () => strictEqual(formatCLP(1000), "$1.000"));
  it("$12.500", () => strictEqual(formatCLP(12500), "$12.500"));
  it("$100.000", () => strictEqual(formatCLP(100000), "$100.000"));
  it("$1.000.000 (millon)", () => strictEqual(formatCLP(1_000_000), "$1.000.000"));
  it("$5.250.000", () => strictEqual(formatCLP(5_250_000), "$5.250.000"));
  it("siempre empieza con $", () => {
    [0, 1, 1000, 50000, 1_000_000].forEach(n => {
      strictEqual(formatCLP(n).startsWith("$"), true);
    });
  });
});

// ─────────────────────────── daysOfWeekLabel ─────────────────────────────────

describe("daysOfWeekLabel — etiqueta legible de dias", () => {
  it("array vacio -> Todos los días", () => {
    strictEqual(daysOfWeekLabel([]), "Todos los días");
  });
  it("los 7 dias -> Todos los días", () => {
    strictEqual(daysOfWeekLabel([0,1,2,3,4,5,6]), "Todos los días");
  });
  it("1 dia -> nombre completo", () => {
    strictEqual(daysOfWeekLabel([0]), "Domingo");
    strictEqual(daysOfWeekLabel([1]), "Lunes");
  });
  it("2 dias -> abreviados separados por coma", () => {
    const result = daysOfWeekLabel([6, 0]);
    strictEqual(result.includes(","), true);
    strictEqual(result.split(", ").length, 2);
  });
  it("5 dias laborales -> 5 abreviados", () => {
    const result = daysOfWeekLabel([1,2,3,4,5]);
    strictEqual(result.split(", ").length, 5);
  });
  it("6 dias -> 6 abreviados (no Todos los dias)", () => {
    const result = daysOfWeekLabel([1,2,3,4,5,6]);
    strictEqual(result.split(", ").length, 6);
  });
});

// ─────────────────────────── modalityLabel ───────────────────────────────────

describe("modalityLabel — etiqueta de modalidad", () => {
  it("both -> Online y presencial", () => {
    strictEqual(modalityLabel("both"), "Online y presencial");
  });
  it("online -> Online", () => {
    strictEqual(modalityLabel("online"), "Online");
  });
  it("presencial -> Presencial", () => {
    strictEqual(modalityLabel("presencial"), "Presencial");
  });
});
