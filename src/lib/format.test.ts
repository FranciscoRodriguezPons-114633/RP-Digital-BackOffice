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

import { sumAmounts } from "./format";

describe("sumAmounts", () => {
  it("suma al centavo, sin errores de coma flotante", () => {
    expect(sumAmounts(["0.10", "0.20"])).toBe(0.3);
    expect(sumAmounts(["1800.55", "199.45", null])).toBe(2000);
    expect(sumAmounts([])).toBe(0);
  });
});

import { formatBytes } from "./format";

describe("formatBytes", () => {
  it("muestra B, KB o MB con coma", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1,5 KB");
    expect(formatBytes(1234567)).toBe("1,2 MB");
  });
});

import { formatArea, formatCostPerM2, parametricEstimate } from "./format";

describe("superficies y costo por m²", () => {
  it("formatea m² con separadores argentinos", () => {
    expect(formatArea(2400)).toBe("2.400 m²");
    expect(formatArea("180.50")).toBe("180,5 m²");
    expect(formatArea(null)).toBe("—");
  });
  it("formatea el costo por m² con la moneda", () => {
    expect(formatCostPerM2("1578.15", "USD").replace(/\s/g, " ")).toBe("USD 1.578,15/m²");
    expect(formatCostPerM2(250000, "ARS").replace(/\s/g, " ")).toBe("ARS 250.000/m²");
    expect(formatCostPerM2(null, "USD")).toBe("—");
  });
});

describe("parametricEstimate", () => {
  it("da lo mismo que la vista budget_totals (prueba pgTAP 15)", () => {
    const e = parametricEstimate({
      coveredM2: 2450,
      semicoveredM2: 180,
      semicoveredFactor: 0.5,
      referenceCostM2: 1503,
      typologyCoef: 1.05,
      qualityCoef: 1,
    });
    expect(e).toEqual({ weightedM2: 2540, total: 4008501, costPerM2: 1578.15 });
  });
  it("redondea a 2 decimales", () => {
    const e = parametricEstimate({
      coveredM2: 2450,
      semicoveredM2: 180,
      semicoveredFactor: 0.4,
      referenceCostM2: 1503,
      typologyCoef: 1.1,
      qualityCoef: 1.25,
    });
    expect(e.total).toBe(5212028.25);
  });
});

import { formatDate } from "./format";

describe("formatDate", () => {
  it("muestra el año y no corre el día", () => {
    expect(formatDate("2027-03-01")).toBe("1 mar 2027");
    expect(formatDate(null)).toBe("—");
  });
});
