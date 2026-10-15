import { describe, expect, it } from "vitest";
import { formatDay, formatHours, formatMoney, todayInCordoba } from "./format";

describe("formatMoney", () => {
  it("usa separadores argentinos y muestra la moneda", () => {
    expect(formatMoney(16800, "USD").replace(/\s/g, " ")).toBe("USD 16.800");
    expect(formatMoney("1234.5", "ARS").replace(/\s/g, " ")).toBe("ARS 1.234,5");
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
