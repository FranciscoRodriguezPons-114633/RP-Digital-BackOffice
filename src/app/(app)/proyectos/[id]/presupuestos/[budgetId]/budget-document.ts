import { createClient } from "@/lib/supabase/server";
import type { CostClass, OverheadKind } from "@/lib/budgets";
import type { BudgetLevel, BudgetStatus } from "@/lib/validation";
import { TOTALS_SELECT, type Totals } from "./budget-summary";

// Todo lo de un presupuesto por rubros o por ítem para imprimirlo o pasarlo a Excel, con los
// montos de las mismas vistas que la pantalla (así los totales cuadran). null si no existe, no
// es de este proyecto o es paramétrico.

export type DocumentBudget = {
  id: string;
  number: number;
  level: Exclude<BudgetLevel, "parametric">;
  status: BudgetStatus;
  currency: string;
  exchange_rate: string | null;
  created_at: string;
  issued_at: string | null;
  notes: string | null;
};
export type DocumentItem = {
  id: string;
  chapter_id: string;
  description: string;
  unit: string;
  quantity: string;
  analysis_id: string | null;
  unit_analyses: { code: string; name: string; unit: string } | null;
  cost: (Record<CostClass, string> & { total: string }) | undefined;
};
export type DocumentChapter = { id: string; name: string; items: DocumentItem[]; subtotal: number };
export type DocumentOverhead = { concept: string; kind: OverheadKind; months: string; monthly_cost: string | null };
export type DocumentAnalysis = { code: string; name: string; unit: string; materials: number; labor: number; equipment: number };

export async function loadBudgetDocument(projectId: string, budgetId: string) {
  const supabase = await createClient();
  const [{ data: budget }, { data: totals }, { data: chapterData }, { data: itemData }, { data: costData }, { data: overheadData }] =
    await Promise.all([
      supabase
        .from("budgets")
        .select("id, number, level, status, currency, exchange_rate, created_at, issued_at, notes")
        .eq("id", budgetId)
        .eq("project_id", projectId)
        .maybeSingle<Omit<DocumentBudget, "level"> & { level: BudgetLevel }>(),
      supabase.from("budget_totals").select(TOTALS_SELECT).eq("budget_id", budgetId).maybeSingle<Totals>(),
      supabase.from("budget_chapters").select("id, name").eq("budget_id", budgetId).order("position").order("name"),
      supabase
        .from("budget_items")
        .select("id, chapter_id, description, unit, quantity, analysis_id, unit_analyses(code, name, unit)")
        .eq("budget_id", budgetId)
        .order("position")
        .order("created_at"),
      supabase
        .from("budget_item_costs")
        .select("item_id, materials, labor, equipment, subcontract, other, total")
        .eq("budget_id", budgetId),
      supabase
        .from("budget_overheads")
        .select("concept, kind, months, monthly_cost")
        .eq("budget_id", budgetId)
        .order("position")
        .order("created_at"),
    ]);
  if (!budget || budget.level === "parametric" || !totals) return null;

  const costs = new Map(
    ((costData ?? []) as (Record<CostClass, string> & { item_id: string; total: string })[]).map((c) => [c.item_id, c]),
  );
  const items = ((itemData ?? []) as unknown as Omit<DocumentItem, "cost">[]).map((i) => ({ ...i, cost: costs.get(i.id) }));
  const chapters: DocumentChapter[] = ((chapterData ?? []) as { id: string; name: string }[]).map((c) => {
    const list = items.filter((i) => i.chapter_id === c.id);
    // Centavos enteros, como la vista: el subtotal es la suma exacta de los ítems.
    const subtotal = list.reduce((acc, i) => acc + Math.round(Number(i.cost?.total ?? 0) * 100), 0) / 100;
    return { id: c.id, name: c.name, items: list, subtotal };
  });

  // Análisis usados, con su costo por unidad en la moneda del presupuesto: la foto si está
  // emitido; si no, el de hoy.
  const analysisItems = items.filter((i) => i.analysis_id && i.unit_analyses);
  const unitCosts = new Map<string, { u_materials: string; u_labor: string; u_equipment: string }>();
  if (analysisItems.length > 0) {
    const [{ data: frozen }, { data: live }] = await Promise.all([
      supabase.from("budget_item_frozen_costs").select("item_id, u_materials, u_labor, u_equipment").eq("budget_id", budgetId),
      supabase.from("budget_item_unit_costs").select("item_id, u_materials, u_labor, u_equipment").eq("budget_id", budgetId),
    ]);
    for (const row of [...((live ?? []) as { item_id: string; u_materials: string; u_labor: string; u_equipment: string }[]),
                       ...((frozen ?? []) as { item_id: string; u_materials: string; u_labor: string; u_equipment: string }[])]) {
      unitCosts.set(row.item_id, row);
    }
  }
  const analyses = new Map<string, DocumentAnalysis>();
  for (const i of analysisItems) {
    const a = i.unit_analyses!;
    if (analyses.has(a.code)) continue;
    const u = unitCosts.get(i.id);
    analyses.set(a.code, {
      code: a.code,
      name: a.name,
      unit: a.unit,
      materials: Number(u?.u_materials ?? 0),
      labor: Number(u?.u_labor ?? 0),
      equipment: Number(u?.u_equipment ?? 0),
    });
  }

  return {
    budget: budget as DocumentBudget,
    totals,
    chapters,
    overheads: (overheadData ?? []) as DocumentOverhead[],
    analyses: [...analyses.values()].sort((x, y) => x.code.localeCompare(y.code, "es")),
  };
}
