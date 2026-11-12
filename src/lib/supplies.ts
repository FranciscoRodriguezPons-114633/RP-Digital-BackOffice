import { z } from "zod";
import { CURRENCIES, isValidCuit, normalizeCuit, parseDecimal } from "./validation";
import { parsePeriod } from "./series";

// Biblioteca de insumos: tipos, formulario e importación desde Excel.

export const SUPPLY_KINDS = ["material", "labor", "equipment", "staff"] as const;
export type SupplyKind = (typeof SUPPLY_KINDS)[number];
export const SUPPLY_KIND_LABEL: Record<SupplyKind, string> = {
  material: "Material",
  labor: "Mano de obra",
  equipment: "Equipo",
  staff: "Personal",
};

export const MAX_IMPORT_ROWS = 2000;
export const MAX_IMPORT_FILE_BYTES = 800 * 1024;
export const SUPPLY_UNITS = ["u", "m", "m2", "m3", "kg", "t", "l", "bolsa", "h", "día", "mes", "gl"] as const;

const CODE_RE = /^[A-Z0-9][A-Z0-9._/-]{0,39}$/;

const code = z
  .string({ error: "Indicá el código" })
  .trim()
  .toUpperCase()
  .regex(CODE_RE, { error: "Código: hasta 40 letras, números, puntos, guiones o barras, sin espacios" });
const name = z
  .string({ error: "Indicá el nombre" })
  .trim()
  .min(2, { error: "Indicá el nombre" })
  .max(200, { error: "Nombre: hasta 200 caracteres" });
const unit = z
  .string({ error: "Indicá la unidad" })
  .trim()
  .min(1, { error: "Indicá la unidad" })
  .max(20, { error: "Unidad: hasta 20 caracteres" });
const price = z
  .unknown()
  .transform((v) => (typeof v === "number" ? v : parseDecimal(v)))
  .refine((v): v is number => v !== null && !Number.isNaN(v) && v > 0, { error: "El precio tiene que ser mayor que cero" })
  .refine((v) => v <= 9_999_999_999, { error: "El precio es demasiado grande" });

const optionalId = z
  .union([z.literal(""), z.uuid()])
  .optional()
  .transform((v) => (v ? v : null));

// Formulario de alta y edición. Si la mano de obra toma el precio de una escala salarial,
// el precio, la moneda y la fecha los calcula la base.
export const supplySchema = z
  .object({
    kind: z.enum(SUPPLY_KINDS, { error: "Elegí el tipo" }),
    code,
    name,
    unit,
    currency: z.enum(CURRENCIES).optional(),
    price: z.unknown().optional(),
    price_date: z.union([z.literal(""), z.iso.date({ error: "Fecha inválida" })]).optional(),
    supplier_party_id: optionalId,
    reference_series_code: z
      .union([z.literal(""), z.string().regex(/^[a-z0-9_]{2,40}$/)])
      .optional()
      .transform((v) => (v ? v : null)),
    active: z
      .unknown()
      .optional()
      .transform((v) => v !== "off" && v !== "false"),
  })
  .transform((s, ctx) => {
    if (s.reference_series_code) {
      if (s.kind !== "labor") {
        ctx.addIssue({ code: "custom", path: ["reference_series_code"], message: "Solo la mano de obra toma el precio de una escala" });
      }
      return { ...s, currency: "ARS" as const, price: null, price_date: null };
    }
    const parsed = price.safeParse(s.price);
    if (!parsed.success) ctx.addIssue({ code: "custom", path: ["price"], message: parsed.error.issues[0].message });
    if (!s.currency) ctx.addIssue({ code: "custom", path: ["currency"], message: "Elegí la moneda" });
    if (!s.price_date) ctx.addIssue({ code: "custom", path: ["price_date"], message: "Indicá la fecha del precio" });
    return { ...s, currency: s.currency ?? "ARS", price: parsed.success ? parsed.data : null, price_date: s.price_date || null };
  });

export const laborSettingSchema = z.object({
  charges_pct: z
    .unknown()
    .transform((v) => parseDecimal(v))
    .refine((v): v is number => v !== null && !Number.isNaN(v) && v >= 0 && v <= 500, {
      error: "Indicá un porcentaje entre 0 y 500",
    }),
  valid_from: z.iso.date({ error: "Indicá desde cuándo vale" }),
});

// ---------------------------------------------------------------------------
// Importación desde Excel
// ---------------------------------------------------------------------------

export type ImportRow = {
  line: number;
  kind: SupplyKind;
  code: string;
  name: string;
  unit: string;
  currency: (typeof CURRENCIES)[number];
  price: number;
  price_date: string;
  supplier_tax_id: string | null;
};
export type ImportError = { line: number; message: string };

// Encabezados de la plantilla, en orden. Se reconocen sin importar mayúsculas ni acentos.
export const IMPORT_COLUMNS = [
  { key: "kind", header: "Tipo", width: 16 },
  { key: "code", header: "Código", width: 14 },
  { key: "name", header: "Nombre", width: 44 },
  { key: "unit", header: "Unidad", width: 10 },
  { key: "currency", header: "Moneda", width: 10 },
  { key: "price", header: "Precio", width: 14 },
  { key: "price_date", header: "Fecha", width: 14 },
  { key: "supplier_tax_id", header: "CUIT del proveedor", width: 20 },
] as const;
type ColumnKey = (typeof IMPORT_COLUMNS)[number]["key"];

const plain = (v: unknown) =>
  String(v ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

const HEADER_ALIASES: Record<string, ColumnKey> = {
  tipo: "kind",
  codigo: "code",
  cod: "code",
  nombre: "name",
  descripcion: "name",
  unidad: "unit",
  un: "unit",
  moneda: "currency",
  precio: "price",
  "precio unitario": "price",
  fecha: "price_date",
  "fecha del precio": "price_date",
  "cuit del proveedor": "supplier_tax_id",
  "cuit proveedor": "supplier_tax_id",
  cuit: "supplier_tax_id",
};

const KIND_ALIASES: Record<string, SupplyKind> = {
  material: "material",
  materiales: "material",
  "mano de obra": "labor",
  mo: "labor",
  equipo: "equipment",
  equipos: "equipment",
  personal: "staff",
};

const CURRENCY_ALIASES: Record<string, (typeof CURRENCIES)[number]> = {
  ars: "ARS",
  pesos: "ARS",
  $: "ARS",
  usd: "USD",
  dolares: "USD",
  "u$s": "USD",
  us$: "USD",
};

// Fecha de una celda: Date de Excel, "2026-11-12" o "12/11/2026" (día/mes/año).
export function parseCellDate(v: unknown): string | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  const s = String(v ?? "").trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) {
    const dmy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4}|\d{2})$/);
    if (dmy) m = [s, dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3], dmy[2], dmy[1]] as RegExpMatchArray;
  }
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  // Reutiliza el control de mes y año de las series, y valida el día contra el calendario.
  if (!parsePeriod(`${y}-${mo}`)) return null;
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString().slice(0, 10);
}

// Recibe las filas de la hoja como arreglos de celdas (la primera fila con datos es el encabezado)
// y devuelve las filas válidas y los errores por número de fila de la planilla.
export function parseSupplySheet(sheet: unknown[][]): { rows: ImportRow[]; errors: ImportError[] } {
  const rows: ImportRow[] = [];
  const errors: ImportError[] = [];
  const isEmpty = (r: unknown[] | undefined) => !r || r.every((c) => plain(c) === "");

  const headerIndex = sheet.findIndex((r) => !isEmpty(r));
  if (headerIndex === -1) return { rows, errors: [{ line: 0, message: "La planilla está vacía" }] };

  const columns = new Map<ColumnKey, number>();
  sheet[headerIndex].forEach((cell, i) => {
    const key = HEADER_ALIASES[plain(cell)];
    if (key && !columns.has(key)) columns.set(key, i);
  });
  const missing = IMPORT_COLUMNS.filter((c) => c.key !== "supplier_tax_id" && !columns.has(c.key));
  if (missing.length > 0) {
    return {
      rows,
      errors: [{ line: headerIndex + 1, message: `Faltan columnas: ${missing.map((c) => c.header).join(", ")}. Usá la plantilla.` }],
    };
  }

  const seen = new Map<string, number>();
  for (let i = headerIndex + 1; i < sheet.length; i++) {
    const r = sheet[i];
    if (isEmpty(r)) continue;
    const line = i + 1;
    const cell = (k: ColumnKey) => (columns.has(k) ? r[columns.get(k)!] : undefined);
    const fail = (message: string) => errors.push({ line, message });

    if (rows.length + errors.length >= MAX_IMPORT_ROWS) {
      errors.push({ line, message: `Hasta ${MAX_IMPORT_ROWS} filas por importación: el resto no se leyó` });
      break;
    }
    const kind = KIND_ALIASES[plain(cell("kind"))];
    if (!kind) {
      fail("Tipo: material, mano de obra, equipo o personal");
      continue;
    }
    const parsedCode = code.safeParse(String(cell("code") ?? ""));
    if (!parsedCode.success) {
      fail(parsedCode.error.issues[0].message);
      continue;
    }
    const parsedName = name.safeParse(String(cell("name") ?? ""));
    if (!parsedName.success) {
      fail(parsedName.error.issues[0].message);
      continue;
    }
    const parsedUnit = unit.safeParse(String(cell("unit") ?? ""));
    if (!parsedUnit.success) {
      fail(parsedUnit.error.issues[0].message);
      continue;
    }
    const currency = CURRENCY_ALIASES[plain(cell("currency"))];
    if (!currency) {
      fail("Moneda: ARS o USD");
      continue;
    }
    const parsedPrice = price.safeParse(cell("price"));
    if (!parsedPrice.success) {
      fail(parsedPrice.error.issues[0].message);
      continue;
    }
    const priceDate = parseCellDate(cell("price_date"));
    if (!priceDate) {
      fail("Fecha: usá día/mes/año, por ejemplo 12/11/2026");
      continue;
    }
    const rawTaxId = String(cell("supplier_tax_id") ?? "").trim();
    if (rawTaxId && !isValidCuit(rawTaxId)) {
      fail("El CUIT del proveedor no es válido");
      continue;
    }
    if (seen.has(parsedCode.data)) {
      fail(`El código ${parsedCode.data} está repetido (fila ${seen.get(parsedCode.data)})`);
      continue;
    }
    seen.set(parsedCode.data, line);
    rows.push({
      line,
      kind,
      code: parsedCode.data,
      name: parsedName.data,
      unit: parsedUnit.data,
      currency,
      price: Math.round(parsedPrice.data * 10000) / 10000,
      price_date: priceDate,
      supplier_tax_id: rawTaxId ? normalizeCuit(rawTaxId) : null,
    });
  }
  if (rows.length === 0 && errors.length === 0) errors.push({ line: headerIndex + 1, message: "La planilla no tiene filas con datos" });
  return { rows, errors };
}
