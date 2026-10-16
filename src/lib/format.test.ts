import { describe, expect, it } from "vitest";
import { formatDay, formatHours, formatMoney, todayInCordoba } from "./format";

describe("formatMoney", () => {
  it("usa separadores argentinos y muestra la moneda", () => {
    expect(formatMoney(16800, "USD").replace(/\s/g, " ")).toBe("USD 16.800");
    expect(formatMoney("1234.5", "ARS").replace(/\s/g, " ")).toBe("ARS 1.234,50");
    expect(formatMoney("5563.20", "USD").replace(/\s/g, " ")).toBe("USD 5.563,20");
  });
  it("muestra una raya si no hay monto", () => {
    expect(formatMoney(null, "USD")).toBe("—");
  });
});

describe("formatHours", () => {
  it("usa coma decimal", () => {
    expect(formatHours(7.5)).toBe("7,5 h");
  });
});

describe("fechas", () => {
  it("hoy en Córdoba aunque en UTC ya sea mañana", () => {
    expect(todayInCordoba(new Date("2026-10-16T01:30:00Z"))).toBe("2026-10-15");
  });
  it("una fecha de la base no se corre de día", () => {
    expect(formatDay("2026-10-15")).toMatch(/15 oct/);
  });
});

import { formatFactor, formatPeriod } from "./format";

describe("índices", () => {
  it("muestra el mes abreviado", () => {
    expect(formatPeriod("2026-07-01")).toBe("jul 2026");
    expect(formatPeriod("2026-09-01")).toBe("sep 2026");
  });
  it("muestra el factor con 4 decimales y coma", () => {
    expect(formatFactor(112.34, 100)).toBe("× 1,1234");
  });
});
