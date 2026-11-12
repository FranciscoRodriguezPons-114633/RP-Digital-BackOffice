import { describe, expect, it } from "vitest";
import { componentsSchema, unitAnalysisCost, unitAnalysisSchema, type CostComponent } from "./analyses";

// El mismo ejemplo que supabase/tests/database/20_analisis_de_precios.test.sql: el cálculo en
// vivo del editor tiene que dar lo mismo que la vista unit_analysis_costs.
const MAMPOSTERIA: CostComponent[] = [
  { kind: "material", currency: "ARS", price: 320, yield: 15.5, wastePct: 5 },
  { kind: "material", currency: "ARS", price: 190, yield: 4.2, wastePct: 5 },
  { kind: "material", currency: "ARS", price: 42000, yield: 0.03, wastePct: 10 },
  { kind: "labor", currency: "ARS", price: 6743.75, yield: 0.8, wastePct: 0 },
  { kind: "labor", currency: "ARS", price: 5720, yield: 0.6, wastePct: 0 },
  { kind: "equipment", currency: "USD", price: 3.75, yield: 0.05, wastePct: 0 },
];

describe("unitAnalysisCost", () => {
  it("separa materiales, mano de obra y equipos, por moneda, igual que la vista", () => {
    expect(unitAnalysisCost(MAMPOSTERIA)).toEqual([
      { currency: "ARS", materials: 7431.9, labor: 8827, equipment: 0, total: 16258.9, components: 5, unpriced: 0 },
      { currency: "USD", materials: 0, labor: 0, equipment: 0.19, total: 0.19, components: 1, unpriced: 0 },
    ]);
  });

  it("un insumo sin precio no suma y se cuenta aparte", () => {
    const [ars] = unitAnalysisCost([
      { kind: "material", currency: "ARS", price: null, yield: 15.5, wastePct: 5 },
      { kind: "material", currency: "ARS", price: 190, yield: 3.1, wastePct: 5 },
      { kind: "labor", currency: "ARS", price: 6743.75, yield: 0.7, wastePct: 0 },
    ]);
    expect(ars).toMatchObject({ materials: 618.45, labor: 4720.63, total: 5339.08, components: 3, unpriced: 1 });
  });

  it("el total es la suma de las partes ya redondeadas", () => {
    const [c] = unitAnalysisCost([
      { kind: "material", currency: "ARS", price: 1, yield: 0.005, wastePct: 0 },
      { kind: "labor", currency: "ARS", price: 1, yield: 0.005, wastePct: 0 },
    ]);
    expect(c.total).toBe(c.materials + c.labor + c.equipment);
  });

  it("sin componentes no devuelve nada", () => {
    expect(unitAnalysisCost([])).toEqual([]);
  });
});

describe("esquemas", () => {
  it("normaliza el código y acepta el desperdicio con coma", () => {
    const r = unitAnalysisSchema.safeParse({ code: " mam-h18 ", name: "Mampostería", unit: "m2", chapter: "Mampostería", default_waste_pct: "7,5" });
    expect(r.success && r.data).toMatchObject({ code: "MAM-H18", default_waste_pct: 7.5, notes: null });
    expect(unitAnalysisSchema.safeParse({ code: "A", name: "Mampostería", unit: "m2", chapter: "M", default_waste_pct: "" }).success).toBe(false);
  });

  it("valida los componentes: rendimiento mayor que cero, desperdicio de 0 a 100, sin repetidos", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const ok = componentsSchema.safeParse([{ supply_id: id, yield: "15,5", waste_pct: "5" }]);
    expect(ok.success && ok.data).toEqual([{ supply_id: id, yield: 15.5, waste_pct: 5 }]);
    expect(componentsSchema.safeParse([{ supply_id: id, yield: "0", waste_pct: "5" }]).success).toBe(false);
    expect(componentsSchema.safeParse([{ supply_id: id, yield: "1", waste_pct: "101" }]).success).toBe(false);
    expect(componentsSchema.safeParse([{ supply_id: id, yield: 1, waste_pct: 0 }, { supply_id: id, yield: 2, waste_pct: 0 }]).success).toBe(false);
  });
});
