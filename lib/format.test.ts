import { describe, it } from "node:test";
import { strictEqual } from "node:assert";
import {
  toISODateLocal,
  daysOfWeekLabel,
  modalityLabel,
  formatCLP,
} from "./format.ts";

// Estos helpers concentran la lógica de fecha/moneda donde se esconden los
// bugs de timezone (ver auditoría B1). Tests puros, sin DB.

describe("toISODateLocal", () => {
  it("usa la fecha LOCAL, no UTC (no rueda al día siguiente de noche)", () => {
    // 23:30 local — toISOString() daría el día siguiente en Chile (UTC-3/-4).
    const d = new Date(2026, 5, 13, 23, 30);
    strictEqual(toISODateLocal(d), "2026-06-13");
  });

  it("rellena mes y día con cero", () => {
    strictEqual(toISODateLocal(new Date(2026, 0, 5)), "2026-01-05");
  });
});

describe("daysOfWeekLabel", () => {
  it("vacío = todos los días", () => {
    strictEqual(daysOfWeekLabel([]), "Todos los días");
  });
  it("los 7 días = todos los días", () => {
    strictEqual(daysOfWeekLabel([0, 1, 2, 3, 4, 5, 6]), "Todos los días");
  });
  it("un día = nombre completo", () => {
    strictEqual(daysOfWeekLabel([3]), "Miércoles");
  });
  it("varios días = abreviados", () => {
    strictEqual(daysOfWeekLabel([6, 0]), "Sáb, Dom");
  });
});

describe("modalityLabel", () => {
  it("both", () => strictEqual(modalityLabel("both"), "Online y presencial"));
  it("online", () => strictEqual(modalityLabel("online"), "Online"));
  it("presencial", () => strictEqual(modalityLabel("presencial"), "Presencial"));
});

describe("formatCLP", () => {
  it("separador de miles es-CL", () => {
    strictEqual(formatCLP(12500), "$12.500");
    strictEqual(formatCLP(1250000), "$1.250.000");
  });
});
