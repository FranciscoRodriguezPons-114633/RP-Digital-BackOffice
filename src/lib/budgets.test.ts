import { describe, expect, it } from "vitest";
import {
  budgetIndexSchema,
  budgetItemSchema,
  conversionFactor,
  feesSchema,
  itemLine,
  markup,
  markupSchema,
  overheadSchema,
} from "./budgets";

// Mismos casos que supabase/tests/database/21_presupuesto_por_item.test.sql: el monto en vivo
// del formulario tiene que dar lo mismo que la vista budget_item_costs.
const APU = [
  { currency: "ARS", materials: 1000, labor: 1000, equipment: 0 },
  { currency: "USD", materials: 0, labor: 0, equipment: 1.5 },
];

describe("itemLine", () => {
  it("separa las partes y pasa a pesos lo que está en dólares", () => {
    expect(itemLine({ quantity: 12.5, budgetCurrency: "ARS", rate: 1000, isSubcontract: false, analysis: APU })).toEqual({
      parts: { materials: 12500, labor: 12500, equipment: 18750, subcontract: 0, other: 0 },
      total: 43750,
      missingRate: false,
    });
  });

  it("un ítem subcontratado va entero a subcontratos", () => {
    const r = itemLine({ quantity: 10, budgetCurrency: "ARS", rate: 1000, isSubcontract: true, analysis: APU });
    expect(r.parts).toEqual({ materials: 0, labor: 0, equipment: 0, subcontract: 35000, other: 0 });
    expect(r.total).toBe(35000);
  });

  it("sin tipo de cambio no valoriza y avisa", () => {
    expect(itemLine({ quantity: 1, budgetCurrency: "ARS", rate: null, isSubcontract: false, analysis: APU })).toMatchObject({
      total: 0,
      missingRate: true,
    });
  });

  it("precio directo: cada línea se redondea al centavo", () => {
    const r = itemLine({
      quantity: 3.333,
      budgetCurrency: "ARS",
      rate: null,
      isSubcontract: false,
      direct: { unitPrice: 1234.5678, costClass: "materials" },
    });
    expect(r).toEqual({ parts: { materials: 4114.81, labor: 0, equipment: 0, subcontract: 0, other: 0 }, total: 4114.81, missingRate: false });
  });

  it("presupuesto en dólares con un análisis en pesos", () => {
    const r = itemLine({ quantity: 2, budgetCurrency: "USD", rate: 1000, isSubcontract: false, analysis: [APU[0]] });
    expect(r.total).toBe(4);
  });
});

describe("conversionFactor", () => {
  it("misma moneda, pesos a dólares y al revés", () => {
    expect(conversionFactor("ARS", "ARS", null)).toBe(1);
    expect(conversionFactor("USD", "ARS", 1000)).toBe(1000);
    expect(conversionFactor("ARS", "USD", 1000)).toBe(0.001);
    expect(conversionFactor("USD", "ARS", null)).toBeNull();
  });
});

describe("budgetItemSchema", () => {
  const base = { chapter_id: "11111111-1111-4111-8111-111111111111", description: "Muro de 18 cm", unit: "m2", quantity: "12,5" };
  it("por análisis pide el análisis", () => {
    const ok = budgetItemSchema.safeParse({ ...base, mode: "analysis", analysis_id: "22222222-2222-4222-8222-222222222222" });
    expect(ok.success && ok.data).toMatchObject({ quantity: 12.5, unit_price: null, direct_class: null, is_subcontract: false });
    expect(budgetItemSchema.safeParse({ ...base, mode: "analysis", analysis_id: "" }).success).toBe(false);
  });
  it("por precio directo pide precio y parte del costo", () => {
    const ok = budgetItemSchema.safeParse({ ...base, mode: "direct", unit_price: "1.800.000", direct_class: "subcontract", is_subcontract: "on" });
    expect(ok.success && ok.data).toMatchObject({ analysis_id: null, unit_price: 1800000, direct_class: "subcontract", is_subcontract: true });
    expect(budgetItemSchema.safeParse({ ...base, mode: "direct", unit_price: "0", direct_class: "other" }).success).toBe(false);
    expect(budgetItemSchema.safeParse({ ...base, mode: "direct", unit_price: "10", direct_class: "" }).success).toBe(false);
  });
  it("la cantidad tiene que ser mayor que cero", () => {
    expect(budgetItemSchema.safeParse({ ...base, quantity: "0", mode: "direct", unit_price: "1", direct_class: "other" }).success).toBe(false);
  });
});

describe("markup (pase)", () => {
  // Los mismos números que la prueba pgTAP 22_presupuesto_resumen.
  const pcts = { overheadPct: 10, profitPct: 15, taxPct: 5 };

  it("en cascada aplica cada porcentaje sobre el subtotal anterior", () => {
    const m = markup(19500, { ...pcts, method: "cascade" });
    expect(m).toMatchObject({ overhead: 1950, profit: 3217.5, tax: 1233.38, amount: 6400.88, price: 25900.88 });
    expect(m.coefficient).toBeCloseTo(1.32825, 5);
  });

  it("sobre el costo aplica los tres porcentajes al costo", () => {
    expect(markup(19500, { ...pcts, method: "on_cost" })).toMatchObject({
      overhead: 1950,
      profit: 2925,
      tax: 975,
      amount: 5850,
      price: 25350,
    });
  });

  it("suma los honorarios después del pase, sin aplicarles porcentajes", () => {
    const m = markup(19500, { ...pcts, method: "cascade" }, 25000);
    expect(m.amount).toBe(6400.88);
    expect(m.price).toBe(50900.88);
  });

  it("sin costo no hay coeficiente", () => {
    expect(markup(0, { ...pcts, method: "cascade" })).toMatchObject({ price: 0, coefficient: null });
  });
});

describe("esquemas del resumen", () => {
  it("los porcentajes vacíos son cero y aceptan coma decimal", () => {
    expect(markupSchema.parse({ overhead_pct: "12,5", profit_pct: "", tax_pct: "3", markup_method: "on_cost" })).toEqual({
      overhead_pct: 12.5,
      profit_pct: 0,
      tax_pct: 3,
      markup_method: "on_cost",
    });
    expect(markupSchema.safeParse({ overhead_pct: "120", profit_pct: "0", tax_pct: "0", markup_method: "cascade" }).success).toBe(false);
  });

  it("un indirecto puede quedar sin costo mensual", () => {
    expect(overheadSchema.parse({ kind: "staff", concept: " Capataz ", months: "7", monthly_cost: "" })).toEqual({
      kind: "staff",
      concept: "Capataz",
      months: 7,
      monthly_cost: null,
    });
  });

  it("por horas pide horas y costo por hora", () => {
    expect(feesSchema.safeParse({ fees_mode: "hours", fees_hours: "", fees_hourly_rate: "250" }).success).toBe(false);
    expect(feesSchema.parse({ fees_mode: "hours", fees_hours: "100", fees_hourly_rate: "250" })).toEqual({
      mode: "hours",
      hours: 100,
      rate: 250,
    });
    expect(feesSchema.parse({ fees_mode: "stages" })).toEqual({ mode: "stages", hours: null, rate: null });
  });
});

describe("budgetIndexSchema", () => {
  it("el mes base del input de mes se guarda como primer día", () => {
    expect(budgetIndexSchema.parse({ index_mode: "general", index_base_period: "2026-10", index_general: "CAC general" })).toEqual({
      mode: "general",
      basePeriod: "2026-10-01",
      general: "CAC general",
      materials: null,
      labor: null,
    });
  });

  it("por partes pide los índices de materiales y mano de obra; el general es opcional", () => {
    expect(budgetIndexSchema.safeParse({ index_mode: "by_part", index_base_period: "2026-10", index_materials: "CAC mat" }).success).toBe(false);
    expect(
      budgetIndexSchema.parse({ index_mode: "by_part", index_base_period: "2026-10-15", index_materials: "CAC mat", index_labor: "CAC MO", index_general: "" }),
    ).toMatchObject({ basePeriod: "2026-10-01", general: null, materials: "CAC mat", labor: "CAC MO" });
  });

  it("sin ajuste limpia todo", () => {
    expect(budgetIndexSchema.parse({ index_mode: "none", index_general: "CAC" })).toMatchObject({ mode: "none", general: null, basePeriod: null });
  });
});
