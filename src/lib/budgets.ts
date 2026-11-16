import { z } from "zod";
import { parseDecimal } from "./validation";

// Presupuesto por rubros e ítems.

export const COST_CLASSES = ["materials", "labor", "equipment", "subcontract", "other"] as const;
export type CostClass = (typeof COST_CLASSES)[number];
export const COST_CLASS_LABEL: Record<CostClass, string> = {
  materials: "Materiales",
  labor: "Mano de obra",
  equipment: "Equipos",
  subcontract: "Subcontratos",
  other: "Otros",
};

export const ITEM_LEVELS = ["by_item", "by_chapter"] as const;
export type ItemLevel = (typeof ITEM_LEVELS)[number];
export const ITEM_LEVEL_HINT: Record<ItemLevel, string> = {
  by_item: "Ítems valorizados con análisis de precios: para el proyecto ejecutivo.",
  by_chapter: "Un monto global por rubro: para el anteproyecto.",
};

export type Parts = Record<CostClass, number>;

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const zero = (): Parts => ({ materials: 0, labor: 0, equipment: 0, subcontract: 0, other: 0 });

// Costo por unidad de un análisis, en una moneda (como sale de unit_analysis_costs).
export type AnalysisCostRow = { currency: string; materials: number; labor: number; equipment: number };

// Pasa un monto de una moneda a la del presupuesto con su tipo de cambio (pesos por dólar).
// null si hace falta el tipo de cambio y no está.
export function conversionFactor(from: string, to: string, rate: number | null) {
  if (from === to) return 1;
  if (rate === null || rate <= 0) return null;
  if (to === "ARS" && from === "USD") return rate;
  if (to === "USD" && from === "ARS") return 1 / rate;
  return null;
}

// Misma cuenta que la vista budget_item_costs, para el monto en vivo del formulario: costo por
// unidad en la moneda del presupuesto, cada parte × cantidad redondeada al centavo, y el total
// como suma de las partes. Un ítem subcontratado va entero a subcontratos.
export function itemLine(input: {
  quantity: number;
  budgetCurrency: string;
  rate: number | null;
  isSubcontract: boolean;
  analysis?: AnalysisCostRow[];
  direct?: { unitPrice: number; costClass: CostClass };
}): { parts: Parts; total: number; missingRate: boolean } {
  const unit = zero();
  let missingRate = false;
  if (input.analysis) {
    for (const row of input.analysis) {
      const f = conversionFactor(row.currency, input.budgetCurrency, input.rate);
      if (f === null) {
        missingRate = true;
        continue;
      }
      unit.materials += row.materials * f;
      unit.labor += row.labor * f;
      unit.equipment += row.equipment * f;
    }
  } else if (input.direct) {
    unit[input.direct.costClass] = input.direct.unitPrice;
  }
  if (missingRate) return { parts: zero(), total: 0, missingRate };

  const line = zero();
  for (const k of COST_CLASSES) line[k] = round2(input.quantity * unit[k]);
  const total = round2(COST_CLASSES.reduce((acc, k) => acc + line[k], 0));
  const parts = input.isSubcontract ? { ...zero(), subcontract: total } : line;
  return { parts, total, missingRate };
}

const positive = (label: string, max: number) =>
  z
    .unknown()
    .transform((v) => (typeof v === "number" ? v : parseDecimal(v)))
    .refine((v): v is number => v !== null && !Number.isNaN(v) && v > 0, { error: `${label}: tiene que ser mayor que cero` })
    .refine((v) => v <= max, { error: `${label}: es demasiado grande` });

export const budgetItemSchema = z
  .object({
    chapter_id: z.uuid({ error: "Elegí el rubro" }),
    description: z
      .string({ error: "Indicá la descripción" })
      .trim()
      .min(2, { error: "Indicá la descripción" })
      .max(300, { error: "Hasta 300 caracteres" }),
    unit: z.string({ error: "Indicá la unidad" }).trim().min(1, { error: "Indicá la unidad" }).max(20, { error: "Hasta 20 caracteres" }),
    quantity: positive("Cantidad", 9_999_999_999),
    mode: z.enum(["analysis", "direct"], { error: "Elegí cómo se valoriza" }),
    analysis_id: z.unknown().optional(),
    unit_price: z.unknown().optional(),
    direct_class: z.unknown().optional(),
    is_subcontract: z
      .unknown()
      .optional()
      .transform((v) => v === "on" || v === "true" || v === true),
  })
  .transform((s, ctx) => {
    const base = { chapter_id: s.chapter_id, description: s.description, unit: s.unit, quantity: s.quantity, is_subcontract: s.is_subcontract };
    if (s.mode === "analysis") {
      const id = z.uuid().safeParse(s.analysis_id);
      if (!id.success) ctx.addIssue({ code: "custom", path: ["analysis_id"], message: "Elegí el análisis de precios" });
      return { ...base, analysis_id: id.success ? id.data : null, unit_price: null, direct_class: null };
    }
    const price = positive("Precio unitario", 9_999_999_999).safeParse(s.unit_price);
    if (!price.success) ctx.addIssue({ code: "custom", path: ["unit_price"], message: price.error.issues[0].message });
    const cls = z.enum(COST_CLASSES).safeParse(s.direct_class);
    if (!cls.success) ctx.addIssue({ code: "custom", path: ["direct_class"], message: "Elegí a qué parte del costo va" });
    return {
      ...base,
      analysis_id: null,
      unit_price: price.success ? price.data : null,
      direct_class: cls.success ? cls.data : null,
    };
  });

export const chapterNameSchema = z
  .string({ error: "Indicá el nombre del rubro" })
  .trim()
  .min(2, { error: "Indicá el nombre del rubro" })
  .max(80, { error: "Hasta 80 caracteres" });

// ---------- Personal e indirectos, honorarios y pase (sprint 7) ----------

export const OVERHEAD_KINDS = ["staff", "indirect"] as const;
export type OverheadKind = (typeof OVERHEAD_KINDS)[number];
export const OVERHEAD_KIND_LABEL: Record<OverheadKind, string> = {
  staff: "Personal de obra",
  indirect: "Indirectos",
};

export const MARKUP_METHODS = ["cascade", "on_cost"] as const;
export type MarkupMethod = (typeof MARKUP_METHODS)[number];
export const MARKUP_METHOD_LABEL: Record<MarkupMethod, string> = {
  cascade: "En cascada",
  on_cost: "Sobre el costo",
};
export const MARKUP_METHOD_HINT: Record<MarkupMethod, string> = {
  cascade: "Cada porcentaje va sobre el subtotal anterior: beneficio sobre costo más gastos generales, e impuestos sobre todo eso.",
  on_cost: "Los tres porcentajes van sobre el costo.",
};

export const FEES_MODES = ["none", "stages", "hours"] as const;
export type FeesMode = (typeof FEES_MODES)[number];
export const FEES_MODE_LABEL: Record<FeesMode, string> = {
  none: "Sin honorarios",
  stages: "De las etapas del proyecto",
  hours: "Por horas estimadas",
};

// Misma cuenta que la vista budget_totals, para ver el pase en vivo mientras se cargan los
// porcentajes. Cada monto se redondea al centavo y el precio es la suma de los redondeados.
//   cascada   : GG = costo × gg% · B = (costo + GG) × b% · I = (costo + GG + B) × i%
//   s/ costo  : GG = costo × gg% · B = costo × b%        · I = costo × i%
// Los honorarios van aparte, después del pase.
export function markup(
  cost: number,
  { overheadPct, profitPct, taxPct, method }: { overheadPct: number; profitPct: number; taxPct: number; method: MarkupMethod },
  fees = 0,
) {
  const overhead = round2((cost * overheadPct) / 100);
  const profit = round2(((method === "cascade" ? cost + overhead : cost) * profitPct) / 100);
  const tax = round2(((method === "cascade" ? cost + overhead + profit : cost) * taxPct) / 100);
  const amount = round2(overhead + profit + tax);
  const price = round2(cost + amount + fees);
  // Coeficiente de pase: precio sin honorarios sobre costo (1,30 = 30 % arriba del costo).
  const coefficient = cost > 0 ? (cost + amount) / cost : null;
  return { overhead, profit, tax, amount, price, coefficient };
}

const percentage = (label: string) =>
  z
    .unknown()
    .transform((v) => (v === "" || v === null || v === undefined ? 0 : typeof v === "number" ? v : parseDecimal(v)))
    .refine((v): v is number => v !== null && !Number.isNaN(v) && v >= 0 && v <= 100, {
      error: `${label}: de 0 a 100`,
    });

export const markupSchema = z.object({
  overhead_pct: percentage("Gastos generales"),
  profit_pct: percentage("Beneficio"),
  tax_pct: percentage("Impuestos"),
  markup_method: z.enum(MARKUP_METHODS, { error: "Elegí cómo se aplica el pase" }),
});

export const overheadSchema = z.object({
  kind: z.enum(OVERHEAD_KINDS, { error: "Elegí si es personal o un indirecto" }),
  concept: z
    .string({ error: "Indicá el concepto" })
    .trim()
    .min(2, { error: "Indicá el concepto" })
    .max(120, { error: "Hasta 120 caracteres" }),
  months: positive("Meses", 9999),
  // Vacío: todavía sin costo (no suma y se avisa).
  monthly_cost: z
    .unknown()
    .transform((v) => (v === "" || v === null || v === undefined ? null : typeof v === "number" ? v : parseDecimal(v)))
    .refine((v) => v === null || (!Number.isNaN(v) && v > 0), { error: "Costo mensual: mayor que cero, o vacío" })
    .refine((v) => v === null || v <= 9_999_999_999, { error: "Costo mensual: es demasiado grande" }),
});

export const feesSchema = z
  .object({
    fees_mode: z.enum(FEES_MODES, { error: "Elegí de dónde salen los honorarios" }),
    fees_hours: z.unknown().optional(),
    fees_hourly_rate: z.unknown().optional(),
  })
  .transform((s, ctx) => {
    if (s.fees_mode !== "hours") return { mode: s.fees_mode, hours: null, rate: null };
    const hours = positive("Horas", 999_999).safeParse(s.fees_hours);
    if (!hours.success) ctx.addIssue({ code: "custom", path: ["fees_hours"], message: hours.error.issues[0].message });
    const rate = positive("Costo por hora", 9_999_999_999).safeParse(s.fees_hourly_rate);
    if (!rate.success) ctx.addIssue({ code: "custom", path: ["fees_hourly_rate"], message: rate.error.issues[0].message });
    return { mode: s.fees_mode, hours: hours.success ? hours.data : null, rate: rate.success ? rate.data : null };
  });

// ---------- Ajuste por índice (sprint 8) ----------

export const INDEX_MODES = ["none", "general", "by_part"] as const;
export type IndexMode = (typeof INDEX_MODES)[number];
export const INDEX_MODE_LABEL: Record<IndexMode, string> = {
  none: "Sin ajuste",
  general: "Una serie para todo",
  by_part: "Materiales y mano de obra por separado",
};

const indexName = z
  .unknown()
  .transform((v) => (typeof v === "string" && v.trim() ? v.trim() : null));

// El mes base llega como «2026-10» (input type="month") o como fecha completa.
export const budgetIndexSchema = z
  .object({
    index_mode: z.enum(INDEX_MODES, { error: "Elegí cómo se ajusta" }),
    index_base_period: z.unknown().optional(),
    index_general: indexName.optional(),
    index_materials: indexName.optional(),
    index_labor: indexName.optional(),
  })
  .transform((s, ctx) => {
    if (s.index_mode === "none") return { mode: s.index_mode, basePeriod: null, general: null, materials: null, labor: null };
    const raw = typeof s.index_base_period === "string" ? s.index_base_period.trim() : "";
    const m = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(raw);
    if (!m) ctx.addIssue({ code: "custom", path: ["index_base_period"], message: "Elegí el mes base" });
    const general = s.index_general ?? null;
    if (s.index_mode === "general" && !general) {
      ctx.addIssue({ code: "custom", path: ["index_general"], message: "Elegí el índice" });
    }
    if (s.index_mode === "by_part") {
      if (!s.index_materials) ctx.addIssue({ code: "custom", path: ["index_materials"], message: "Elegí el índice de materiales" });
      if (!s.index_labor) ctx.addIssue({ code: "custom", path: ["index_labor"], message: "Elegí el índice de mano de obra" });
    }
    return {
      mode: s.index_mode,
      basePeriod: m ? `${m[1]}-${m[2]}-01` : null,
      general,
      materials: s.index_mode === "by_part" ? (s.index_materials ?? null) : null,
      labor: s.index_mode === "by_part" ? (s.index_labor ?? null) : null,
    };
  });
