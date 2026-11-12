import { z } from "zod";
import { parseDecimal } from "./validation";
import type { SupplyKind } from "./supplies";

// Análisis de precios (APU): costo de una unidad de tarea a partir de sus insumos.

// Rubros habituales, como sugerencia (el rubro es texto libre).
export const CHAPTER_SUGGESTIONS = [
  "Trabajos preliminares",
  "Movimiento de suelos",
  "Estructura",
  "Mampostería",
  "Revoques",
  "Contrapisos y carpetas",
  "Pisos y zócalos",
  "Cubiertas",
  "Aislaciones",
  "Carpinterías",
  "Instalación sanitaria",
  "Instalación eléctrica",
  "Instalación de gas",
  "Pinturas",
  "Varios",
] as const;

export const MAX_COMPONENTS = 100;

export type CostComponent = {
  kind: SupplyKind;
  currency: string;
  // null = insumo sin precio: no suma, pero se avisa.
  price: number | null;
  yield: number;
  wastePct: number;
};
export type UnitCost = {
  currency: string;
  materials: number;
  labor: number;
  equipment: number;
  total: number;
  components: number;
  unpriced: number;
};

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// Costo de un componente: insumo × rendimiento por unidad × (1 + desperdicio).
export function componentCost(c: CostComponent) {
  return c.price === null ? null : c.yield * (1 + c.wastePct / 100) * c.price;
}

// Misma cuenta que la vista unit_analysis_costs, para el cálculo en vivo del editor: por moneda,
// cada parte redondeada a 2 decimales y el total como suma de las partes.
export function unitAnalysisCost(components: CostComponent[]): UnitCost[] {
  const byCurrency = new Map<string, { material: number; labor: number; equipment: number; n: number; unpriced: number }>();
  for (const c of components) {
    let acc = byCurrency.get(c.currency);
    if (!acc) byCurrency.set(c.currency, (acc = { material: 0, labor: 0, equipment: 0, n: 0, unpriced: 0 }));
    acc.n += 1;
    const cost = componentCost(c);
    if (cost === null) acc.unpriced += 1;
    else if (c.kind === "material" || c.kind === "labor" || c.kind === "equipment") acc[c.kind] += cost;
  }
  return [...byCurrency.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, a]) => {
      const materials = round2(a.material);
      const labor = round2(a.labor);
      const equipment = round2(a.equipment);
      return { currency, materials, labor, equipment, total: round2(materials + labor + equipment), components: a.n, unpriced: a.unpriced };
    });
}

const pct = (label: string) =>
  z
    .unknown()
    .transform((v) => (typeof v === "number" ? v : (parseDecimal(v) ?? 0)))
    .refine((v) => !Number.isNaN(v) && v >= 0 && v <= 100, { error: `${label}: entre 0 y 100` });

export const unitAnalysisSchema = z.object({
  code: z
    .string({ error: "Indicá el código" })
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9][A-Z0-9._/-]{0,39}$/, { error: "Código: hasta 40 letras, números, puntos, guiones o barras, sin espacios" }),
  name: z.string({ error: "Indicá el nombre" }).trim().min(2, { error: "Indicá el nombre" }).max(200, { error: "Hasta 200 caracteres" }),
  unit: z.string({ error: "Indicá la unidad" }).trim().min(1, { error: "Indicá la unidad" }).max(20, { error: "Hasta 20 caracteres" }),
  chapter: z.string({ error: "Indicá el rubro" }).trim().min(2, { error: "Indicá el rubro" }).max(80, { error: "Hasta 80 caracteres" }),
  default_waste_pct: pct("Desperdicio"),
  notes: z
    .string()
    .trim()
    .max(2000, { error: "Hasta 2000 caracteres" })
    .optional()
    .transform((v) => (v ? v : null)),
});

// Lo que manda el editor al guardar: la lista completa, en orden.
export const componentsSchema = z
  .array(
    z.object({
      supply_id: z.uuid(),
      yield: z
        .unknown()
        .transform((v) => (typeof v === "number" ? v : parseDecimal(v)))
        .refine((v): v is number => v !== null && !Number.isNaN(v) && v > 0 && v <= 99_999_999, {
          error: "El rendimiento tiene que ser mayor que cero",
        }),
      waste_pct: pct("Desperdicio"),
    }),
  )
  .max(MAX_COMPONENTS, { error: `Hasta ${MAX_COMPONENTS} componentes` })
  .refine((rows) => new Set(rows.map((r) => r.supply_id)).size === rows.length, { error: "Hay un insumo repetido" });
