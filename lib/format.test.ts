import { describe, it, expect } from "vitest";
import {
  toISODateLocal,
  daysOfWeekLabel,
  modalityLabel,
  formatCLP,
} from "@/lib/format";

// Estos helpers concentran la lógica de fecha/moneda donde se esconden los
// bugs de timezone (ver auditoría B1). Tests puros, sin DB.

describe("toISODateLocal", () => {
  it("usa la fecha LOCAL, no UTC (no rueda al día siguiente de noche)", () => {
    // 23:30 local — toISOString() daría el día siguiente en Chile (UTC-3/-4).
    const d = new Date(2026, 5, 13, 23, 30);
    expect(toISODateLocal(d)).toBe("2026-06-13");
  });

  it("rellena mes y día con cero", () => {
    expect(toISODateLocal(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("daysOfWeekLabel", () => {
  it("vacío = todos los días", () => {
    expect(daysOfWeekLabel([])).toBe("Todos los días");
  });
  it("los 7 días = todos los días", () => {
    expect(daysOfWeekLabel([0, 1, 2, 3, 4, 5, 6])).toBe("Todos los días");
  });
  it("un día = nombre completo", () => {
    expect(daysOfWeekLabel([3])).toBe("Miércoles");
  });
  it("varios días = abreviados", () => {
    expect(daysOfWeekLabel([6, 0])).toBe("Sáb, Dom");
  });
});

describe("modalityLabel", () => {
  it("both", () => expect(modalityLabel("both")).toBe("Online y presencial"));
  it("online", () => expect(modalityLabel("online")).toBe("Online"));
  it("presencial", () => expect(modalityLabel("presencial")).toBe("Presencial"));
});

describe("formatCLP", () => {
  it("separador de miles es-CL", () => {
    expect(formatCLP(12500)).toBe("$12.500");
    expect(formatCLP(1250000)).toBe("$1.250.000");
  });
});
