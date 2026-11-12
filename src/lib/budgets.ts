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
