import { describe, expect, it } from "vitest";
import { parsePeriod, parseSeriesPaste } from "./series";

describe("parsePeriod", () => {
  it.each([
    ["2026-09", "2026-09-01"],
    ["2026-09-01", "2026-09-01"],
    ["2026/9", "2026-09-01"],
    ["09/2026", "2026-09-01"],
    ["9-26", "2026-09-01"],
    ["1/9/2026", "2026-09-01"],
    ["01/09/26", "2026-09-01"],
    ["sep-26", "2026-09-01"],
    ["Sept. 2026", "2026-09-01"],
    ["septiembre 2026", "2026-09-01"],
    ["Setiembre de 2026", "2026-09-01"],
    ["ene-27", "2027-01-01"],
  ])("%s → %s", (input, expected) => {
    expect(parsePeriod(input)).toBe(expected);
  });

  it.each(["2026-13", "13/2026", "foo 2026", "", "2026"])("rechaza %s", (input) => {
    expect(parsePeriod(input)).toBeNull();
  });
});

describe("parseSeriesPaste", () => {
  it("lee columnas separadas por tabulador, con encabezado y valores con coma", () => {
    const { rows, errors } = parseSeriesPaste("Mes\tValor\n2026-08\t1.234,56\n2026-09\t1250,1\tprovisorio\n");
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { line: 2, period: "2026-08-01", value: 1234.56, provisional: false },
      { line: 3, period: "2026-09-01", value: 1250.1, provisional: true },
    ]);
  });

  it("lee filas separadas por espacios y punto y coma", () => {
    const { rows, errors } = parseSeriesPaste("sep 2026 115,9\noct-26;117.3 p");
    expect(errors).toEqual([]);
    expect(rows.map((r) => [r.period, r.value, r.provisional])).toEqual([
      ["2026-09-01", 115.9, false],
      ["2026-10-01", 117.3, true],
    ]);
  });

  it("marca errores por fila sin perder las válidas", () => {
    const { rows, errors } = parseSeriesPaste("2026-07\t100\nxx\t5\n2026-08\t0\n2026-07\t101");
    expect(rows).toHaveLength(1);
    expect(errors.map((e) => [e.line, e.message])).toEqual([
      [2, "No se entiende el mes"],
      [3, "El valor tiene que ser un número mayor que cero"],
      [4, "El mes está repetido (fila 1)"],
    ]);
  });

  it("ordena por mes", () => {
    const { rows } = parseSeriesPaste("2026-09\t3\n2026-07\t1\n2026-08\t2");
    expect(rows.map((r) => r.value)).toEqual([1, 2, 3]);
  });
});
