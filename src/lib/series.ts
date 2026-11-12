import { parseDecimal } from "./validation";

// Pegado desde una planilla: una fila por mes, con el mes y el valor (y, opcional, "provisorio").
// Acepta lo que suele salir de Excel o de los PDF de la CAC y del INDEC:
// "2026-09", "09/2026", "1/9/2026", "sep-26", "septiembre 2026"; valores "1.234,56" o "1234.56".

export type PastedRow = { line: number; period: string; value: number; provisional: boolean };
export type PasteError = { line: number; text: string; message: string };

const MONTHS: Record<string, number> = {
  ene: 1, enero: 1, feb: 2, febrero: 2, mar: 3, marzo: 3, abr: 4, abril: 4, may: 5, mayo: 5,
  jun: 6, junio: 6, jul: 7, julio: 7, ago: 8, agosto: 8, sep: 9, sept: 9, set: 9, septiembre: 9, setiembre: 9,
  oct: 10, octubre: 10, nov: 11, noviembre: 11, dic: 12, diciembre: 12,
};

export const MAX_PASTE_ROWS = 600;

function monthStart(year: number, month: number) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12 || year < 1990 || year > 2100) {
    return null;
  }
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

function fullYear(y: string) {
  const n = Number(y);
  return y.length === 2 ? 2000 + n : n;
}

// Devuelve "YYYY-MM-01" o null si no se entiende.
export function parsePeriod(input: string): string | null {
  const s = input.trim().toLowerCase().replace(/\.$/, "");
  let m = s.match(/^(\d{4})[-/](\d{1,2})(?:[-/](\d{1,2}))?$/); // 2026-09, 2026-09-01
  if (m) return monthStart(Number(m[1]), Number(m[2]));
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2}|\d{4})$/); // 1/9/2026 (día/mes/año)
  if (m) return monthStart(fullYear(m[3]), Number(m[2]));
  m = s.match(/^(\d{1,2})[-/](\d{4}|\d{2})$/); // 09/2026, 9-26
  if (m) return monthStart(fullYear(m[2]), Number(m[1]));
  m = s.match(/^([a-záéíóú]+)\.?[\s\-/]*(?:de\s+)?(\d{4}|\d{2})$/); // sep-26, septiembre 2026, sept. de 2026
  if (m && MONTHS[m[1]]) return monthStart(fullYear(m[2]), MONTHS[m[1]]);
  return null;
}

function splitColumns(line: string) {
  const byTab = line.split(/\t|;/).map((c) => c.trim()).filter(Boolean);
  if (byTab.length === 2 && /\s/.test(byTab[1])) return [byTab[0], ...byTab[1].split(/\s+/)]; // "117,3 p"
  if (byTab.length >= 2) return byTab;
  // Sin tabuladores: "sep 2026 1.234,5" → el valor es la última palabra que parece número.
  const words = line.trim().split(/\s+/);
  const flagged = /^provisori[oa]s?$|^p$/i.test(words.at(-1) ?? "");
  const valueIdx = flagged ? words.length - 2 : words.length - 1;
  if (valueIdx < 1) return byTab;
  return [words.slice(0, valueIdx).join(" "), words[valueIdx], ...(flagged ? [words.at(-1)!] : [])];
}

export function parseSeriesPaste(text: string) {
  const rows: PastedRow[] = [];
  const errors: PasteError[] = [];
  const seen = new Map<string, number>();
  const lines = text.split(/\r?\n/);

  lines.forEach((raw, i) => {
    const line = i + 1;
    if (!raw.trim()) return;
    const cols = splitColumns(raw);
    const period = cols[0] ? parsePeriod(cols[0]) : null;
    const value = cols[1] !== undefined ? parseDecimal(cols[1]) : null;

    // La primera fila puede ser el encabezado ("Mes  Valor").
    if (rows.length === 0 && errors.length === 0 && period === null && (value === null || Number.isNaN(value))) {
      if (!/\d/.test(raw)) return;
    }
    if (period === null) {
      errors.push({ line, text: raw.trim(), message: "No se entiende el mes" });
      return;
    }
    if (value === null || Number.isNaN(value) || value <= 0) {
      errors.push({ line, text: raw.trim(), message: "El valor tiene que ser un número mayor que cero" });
      return;
    }
    if (seen.has(period)) {
      errors.push({ line, text: raw.trim(), message: `El mes está repetido (fila ${seen.get(period)})` });
      return;
    }
    seen.set(period, line);
    rows.push({ line, period, value, provisional: /^provisori[oa]s?$|^p$/i.test(cols[2] ?? "") });
  });

  if (rows.length > MAX_PASTE_ROWS) {
    errors.push({ line: 0, text: "", message: `Hasta ${MAX_PASTE_ROWS} meses por carga` });
  }
  rows.sort((a, b) => a.period.localeCompare(b.period));
  return { rows, errors };
}
