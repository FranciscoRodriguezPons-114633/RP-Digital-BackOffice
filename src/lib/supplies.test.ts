import { describe, expect, it } from "vitest";
import { laborSettingSchema, parseCellDate, parseSupplySheet, supplySchema } from "./supplies";

const HEADER = ["Tipo", "Código", "Nombre", "Unidad", "Moneda", "Precio", "Fecha", "CUIT del proveedor"];

describe("parseCellDate", () => {
  it.each([
    [new Date(Date.UTC(2026, 10, 12)), "2026-11-12"],
    ["2026-11-12", "2026-11-12"],
    ["12/11/2026", "2026-11-12"],
    ["1-2-26", "2026-02-01"],
  ])("%s → %s", (input, expected) => {
    expect(parseCellDate(input)).toBe(expected);
  });
  it.each(["31/02/2026", "2026-13-01", "ayer", "", null])("rechaza %s", (input) => {
    expect(parseCellDate(input)).toBeNull();
  });
});

describe("parseSupplySheet", () => {
  it("lee la plantilla: números y fechas de Excel, textos con coma, alias de tipo y moneda", () => {
    const { rows, errors } = parseSupplySheet([
      HEADER,
      ["Material", "mat-001", "Cemento Portland x 50 kg", "bolsa", "ARS", 9500.5, new Date(Date.UTC(2026, 10, 1)), "30-71234567-1"],
      ["mano de obra", "MO-01", "Oficial", "h", "pesos", "6.600,25", "12/11/2026", ""],
      [],
      ["Equipos", "EQ/01", "Hormigonera", "día", "dólares", "12,5", "2026-11-12"],
    ]);
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { line: 2, kind: "material", code: "MAT-001", name: "Cemento Portland x 50 kg", unit: "bolsa", currency: "ARS", price: 9500.5, price_date: "2026-11-01", supplier_tax_id: "30712345671" },
      { line: 3, kind: "labor", code: "MO-01", name: "Oficial", unit: "h", currency: "ARS", price: 6600.25, price_date: "2026-11-12", supplier_tax_id: null },
      { line: 5, kind: "equipment", code: "EQ/01", name: "Hormigonera", unit: "día", currency: "USD", price: 12.5, price_date: "2026-11-12", supplier_tax_id: null },
    ]);
  });

  it("acepta columnas en otro orden y encabezados con otras mayúsculas", () => {
    const { rows, errors } = parseSupplySheet([
      ["PRECIO", "codigo", "Descripción", "UN", "moneda", "tipo", "fecha"],
      [100, "A1", "Arena", "m3", "ARS", "material", "01/11/2026"],
    ]);
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({ code: "A1", name: "Arena", price: 100, unit: "m3" });
  });

  it("marca los errores por fila y sigue con las válidas", () => {
    const { rows, errors } = parseSupplySheet([
      HEADER,
      ["material", "MAT-001", "Cemento", "bolsa", "ARS", 9500, "01/11/2026"],
      ["herramienta", "H-1", "Pala", "u", "ARS", 100, "01/11/2026"],
      ["material", "con espacio", "Cal", "bolsa", "ARS", 100, "01/11/2026"],
      ["material", "MAT-003", "Cal", "bolsa", "EUR", 100, "01/11/2026"],
      ["material", "MAT-004", "Cal", "bolsa", "ARS", 0, "01/11/2026"],
      ["material", "MAT-005", "Cal", "bolsa", "ARS", 100, "32/11/2026"],
      ["material", "MAT-006", "Cal", "bolsa", "ARS", 100, "01/11/2026", "20-12345678-7"],
      ["material", "mat-001", "Cemento otra vez", "bolsa", "ARS", 9600, "01/11/2026"],
    ]);
    expect(rows.map((r) => r.code)).toEqual(["MAT-001"]);
    expect(errors).toEqual([
      { line: 3, message: "Tipo: material, mano de obra, equipo o personal" },
      { line: 4, message: "Código: hasta 40 letras, números, puntos, guiones o barras, sin espacios" },
      { line: 5, message: "Moneda: ARS o USD" },
      { line: 6, message: "El precio tiene que ser mayor que cero" },
      { line: 7, message: "Fecha: usá día/mes/año, por ejemplo 12/11/2026" },
      { line: 8, message: "El CUIT del proveedor no es válido" },
      { line: 9, message: "El código MAT-001 está repetido (fila 2)" },
    ]);
  });

  it("avisa si faltan columnas o la planilla está vacía", () => {
    expect(parseSupplySheet([["Código", "Nombre"], ["A", "B"]]).errors[0].message).toMatch(/^Faltan columnas: Tipo, Unidad, Moneda, Precio, Fecha/);
    expect(parseSupplySheet([]).errors[0].message).toBe("La planilla está vacía");
    expect(parseSupplySheet([HEADER]).errors[0].message).toBe("La planilla no tiene filas con datos");
  });
});

describe("supplySchema", () => {
  const base = { kind: "material", code: " mat-001 ", name: "Cemento", unit: "bolsa" };
  it("normaliza el código y acepta precios con coma", () => {
    const r = supplySchema.safeParse({ ...base, currency: "ARS", price: "9.500,50", price_date: "2026-11-01" });
    expect(r.success && r.data).toMatchObject({ code: "MAT-001", price: 9500.5, currency: "ARS", active: true });
  });
  it("sin escala, pide precio, moneda y fecha", () => {
    const r = supplySchema.safeParse({ ...base, price: "", price_date: "" });
    expect(r.success).toBe(false);
  });
  it("con escala, la mano de obra no necesita precio", () => {
    const r = supplySchema.safeParse({ ...base, kind: "labor", code: "MO-OF", reference_series_code: "uocra_oficial" });
    expect(r.success && r.data).toMatchObject({ price: null, price_date: null, currency: "ARS" });
    expect(supplySchema.safeParse({ ...base, reference_series_code: "uocra_oficial" }).success).toBe(false);
  });
});

describe("laborSettingSchema", () => {
  it("acepta porcentajes con coma y rechaza fuera de rango", () => {
    expect(laborSettingSchema.safeParse({ charges_pct: "62,5", valid_from: "2026-11-01" }).success).toBe(true);
    expect(laborSettingSchema.safeParse({ charges_pct: "-1", valid_from: "2026-11-01" }).success).toBe(false);
    expect(laborSettingSchema.safeParse({ charges_pct: "", valid_from: "2026-11-01" }).success).toBe(false);
  });
});
