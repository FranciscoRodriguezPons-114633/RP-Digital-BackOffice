import { describe, expect, it } from "vitest";
import { budgetItemSchema, conversionFactor, itemLine } from "./budgets";

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
