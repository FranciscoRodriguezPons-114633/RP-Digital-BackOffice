import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Disclosure } from "@/components/disclosure";
import { PageSkeleton } from "@/components/skeleton";
import { StatusPill } from "@/components/status-pill";
import { createClient } from "@/lib/supabase/server";
import { COST_CLASSES, COST_CLASS_LABEL, type CostClass } from "@/lib/budgets";
import { formatArea, formatCostPerM2, formatIndexValue, formatMoney, formatUnitPrice, sumAmounts } from "@/lib/format";
import { BUDGET_LEVEL_LABEL, BUDGET_STATUS_LABEL, idSchema, type BudgetLevel, type BudgetStatus } from "@/lib/validation";
import {
  AddChapterForm,
  BudgetEditorProvider,
  BudgetExchangeRateForm,
  BudgetItemForm,
  DeleteRowButton,
  MoveButtons,
  RenameChapterForm,
  type AnalysisOption,
  type ItemValues,
} from "../../../../budget-forms";
import { ProjectTabs, ProjectTitle, loadWorksProject } from "../../project-header";

export const metadata: Metadata = { title: "Presupuesto" };

type Budget = {
  id: string;
  number: number;
  level: BudgetLevel;
  status: BudgetStatus;
  currency: string;
  exchange_rate: string | null;
  created_at: string;
};
type Totals = Record<CostClass, string | null> & {
  total: string;
  cost_per_m2: string | null;
  weighted_m2: string;
  items: number;
  items_unpriced: number;
  items_missing_rate: number;
};
type Chapter = { id: string; name: string; position: number };
type Item = ItemValues & { position: number; unit_analyses: { code: string; name: string } | null };
type ItemCost = Record<CostClass, string> & { item_id: string; total: string; unpriced_components: number; missing_rate: boolean };

// Análisis que se ofrecen en el formulario de ítems.
const ANALYSES_LIMIT = 500;

export default function BudgetPage({ params }: PageProps<"/proyectos/[id]/presupuestos/[budgetId]">) {
  return (
    <div className="flex flex-col gap-8">
      <Link href="/proyectos" className="text-sm text-muted hover:underline">← Proyectos</Link>
      <Suspense fallback={<PageSkeleton label="Cargando presupuesto…" cards={3} list={false} />}>
        <BudgetEditor params={params} />
      </Suspense>
    </div>
  );
}

async function BudgetEditor({ params }: { params: Promise<{ id: string; budgetId: string }> }) {
  const { id, budgetId } = await params;
  if (!idSchema.safeParse(budgetId).success) notFound();
  const { project, org } = await loadWorksProject(id);
  const supabase = await createClient();

  const [{ data: budget }, { data: totals }, { data: chapterData }, { data: itemData }, { data: costData }] = await Promise.all([
    supabase
      .from("budgets")
      .select("id, number, level, status, currency, exchange_rate, created_at")
      .eq("id", budgetId)
      .eq("project_id", id)
      .maybeSingle<Budget>(),
    supabase
      .from("budget_totals")
      .select("total, cost_per_m2, weighted_m2, materials, labor, equipment, subcontract, other, items, items_unpriced, items_missing_rate")
      .eq("budget_id", budgetId)
      .maybeSingle<Totals>(),
    supabase.from("budget_chapters").select("id, name, position").eq("budget_id", budgetId).order("position").order("name"),
    supabase
      .from("budget_items")
      .select("id, chapter_id, position, description, unit, quantity, analysis_id, unit_price, direct_class, is_subcontract, unit_analyses(code, name)")
      .eq("budget_id", budgetId)
      .order("position")
      .order("created_at"),
    supabase
      .from("budget_item_costs")
      .select("item_id, materials, labor, equipment, subcontract, other, total, unpriced_components, missing_rate")
      .eq("budget_id", budgetId),
  ]);
  if (!budget || budget.level === "parametric" || !totals) notFound();

  const editable = budget.status === "draft";
  const chapters = (chapterData ?? []) as Chapter[];
  const items = (itemData ?? []) as unknown as Item[];
  const costs = new Map(((costData ?? []) as ItemCost[]).map((c) => [c.item_id, c]));
  const rate = budget.exchange_rate === null ? null : Number(budget.exchange_rate);

  // Los análisis (con su costo por unidad) solo hacen falta para editar.
  let analyses: AnalysisOption[] = [];
  if (editable) {
    const [{ data: analysisData }, { data: analysisCosts }] = await Promise.all([
      supabase.from("unit_analyses").select("id, code, name, unit").eq("org_id", org.id).order("code").limit(ANALYSES_LIMIT),
      supabase
        .from("unit_analysis_costs")
        .select("analysis_id, currency, materials, labor, equipment, unpriced_components")
        .eq("org_id", org.id)
        .limit(ANALYSES_LIMIT * 2),
    ]);
    const byAnalysis = new Map<string, AnalysisOption["costs"]>();
    const unpriced = new Map<string, number>();
    for (const c of (analysisCosts ?? []) as {
      analysis_id: string;
      currency: string;
      materials: string;
      labor: string;
      equipment: string;
      unpriced_components: number;
    }[]) {
      const row = { currency: c.currency, materials: Number(c.materials), labor: Number(c.labor), equipment: Number(c.equipment) };
      const list = byAnalysis.get(c.analysis_id);
      if (list) list.push(row);
      else byAnalysis.set(c.analysis_id, [row]);
      unpriced.set(c.analysis_id, (unpriced.get(c.analysis_id) ?? 0) + c.unpriced_components);
    }
    analyses = ((analysisData ?? []) as { id: string; code: string; name: string; unit: string }[]).map((a) => ({
      ...a,
      costs: byAnalysis.get(a.id) ?? [],
      unpriced: unpriced.get(a.id) ?? 0,
    }));
  }

  const parts = COST_CLASSES.map((c) => ({ c, amount: Number(totals[c] ?? 0) })).filter((p) => p.amount !== 0);
  const total = Number(totals.total);
  const level = budget.level as Exclude<BudgetLevel, "parametric">;

  return (
    <BudgetEditorProvider value={{ projectId: project.id, budgetId: budget.id, currency: budget.currency, rate, analyses }}>
      <ProjectTitle project={project} />
      <ProjectTabs projectId={project.id} active="budgets" />

      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <Link href={`/proyectos/${project.id}/presupuestos`} className="text-sm text-muted hover:underline">
          Presupuestos
        </Link>
        <span className="text-sm text-muted">/</span>
        <h2 className="text-lg font-semibold">
          V{budget.number} · {BUDGET_LEVEL_LABEL[level]}
        </h2>
        <StatusPill tone={editable ? "neutral" : "accent"}>{BUDGET_STATUS_LABEL[budget.status]}</StatusPill>
      </div>

      <section className="card flex flex-col gap-4" aria-label="Resumen del presupuesto">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <span className="font-mono text-3xl font-semibold">{formatMoney(total, budget.currency)}</span>
          <span className="font-mono text-sm text-muted">
            {formatCostPerM2(totals.cost_per_m2, budget.currency)} · {formatArea(totals.weighted_m2)} ponderados
          </span>
        </div>
        {parts.length > 0 && (
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
            {parts.map((p) => (
              <div key={p.c} className="rounded-lg bg-sunken p-3">
                <p className="text-xs text-muted">{COST_CLASS_LABEL[p.c]}</p>
                <p className="font-mono font-medium">{formatMoney(p.amount, budget.currency)}</p>
                <p className="text-xs text-muted">{total > 0 ? `${((p.amount / total) * 100).toFixed(1).replace(".", ",")}%` : "—"}</p>
              </div>
            ))}
          </div>
        )}
        {totals.items_missing_rate > 0 && (
          <p className="rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">
            {totals.items_missing_rate === 1 ? "Un ítem tiene" : `${totals.items_missing_rate} ítems tienen`} partes en otra
            moneda y no suman: cargá el tipo de cambio.
          </p>
        )}
        {totals.items_unpriced > 0 && (
          <p className="rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">
            {totals.items_unpriced === 1 ? "Un ítem usa" : `${totals.items_unpriced} ítems usan`} insumos sin precio: el
            total queda corto.{" "}
            <Link href="/insumos?sin_precio=1" className="underline">
              Ver los insumos sin precio
            </Link>
          </p>
        )}
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3 border-t border-line pt-4 text-sm">
          {editable ? (
            <BudgetExchangeRateForm projectId={project.id} budgetId={budget.id} rate={budget.exchange_rate} />
          ) : (
            <p className="text-muted">
              Tipo de cambio: {rate === null ? "sin cargar" : `${formatIndexValue(rate)} pesos por dólar`}
            </p>
          )}
          <p className="max-w-md text-xs text-muted">
            Los insumos en otra moneda se pasan a {budget.currency} con este tipo de cambio. Mientras está en borrador,
            los montos siguen los precios de los insumos.
          </p>
        </div>
      </section>

      {chapters.map((ch, ci) => {
        const list = items.filter((i) => i.chapter_id === ch.id);
        const subtotal = sumAmounts(list.map((i) => costs.get(i.id)?.total ?? 0));
        return (
          <section key={ch.id} className="card flex flex-col gap-3" aria-labelledby={`rubro-${ch.id}`}>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-mono text-sm text-muted">{ci + 1}</span>
              <h3 id={`rubro-${ch.id}`} className="font-medium">
                {ch.name}
              </h3>
              <span className="ml-auto font-mono font-medium">{list.length > 0 ? formatMoney(subtotal, budget.currency) : ""}</span>
              {editable && (
                <MoveButtons
                  projectId={project.id}
                  budgetId={budget.id}
                  kind="chapter"
                  id={ch.id}
                  label={`el rubro ${ch.name}`}
                  first={ci === 0}
                  last={ci === chapters.length - 1}
                />
              )}
            </div>

            {list.length > 0 && (
              <div className="relative overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-muted">
                      <th className="py-2 pr-3 font-medium">Ítem</th>
                      <th className="py-2 pr-3 text-right font-medium">Cantidad</th>
                      <th className="py-2 pr-3 text-right font-medium">Precio unitario</th>
                      <th className="py-2 pr-3 text-right font-medium">Monto</th>
                      {editable && <th className="py-2"><span className="sr-only">Acciones</span></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((it, ii) => {
                      const cost = costs.get(it.id);
                      const amount = Number(cost?.total ?? 0);
                      return (
                        <tr key={it.id} className="border-b border-line align-top last:border-0">
                          <td className="py-2 pr-3">
                            <span className="font-mono text-xs text-muted">
                              {ci + 1}.{ii + 1}
                            </span>{" "}
                            <span className="font-medium">{it.description}</span>
                            <span className="block text-xs text-muted">
                              {it.unit_analyses ? (
                                <>
                                  Análisis <span className="font-mono">{it.unit_analyses.code}</span>
                                </>
                              ) : (
                                `Precio directo · ${COST_CLASS_LABEL[it.direct_class ?? "other"]}`
                              )}
                              {it.is_subcontract && " · subcontratado"}
                            </span>
                            {cost?.missing_rate && <span className="block text-xs text-warn">Falta el tipo de cambio</span>}
                            {(cost?.unpriced_components ?? 0) > 0 && (
                              <span className="block text-xs text-warn">Usa insumos sin precio</span>
                            )}
                          </td>
                          <td className="py-2 pr-3 text-right font-mono whitespace-nowrap">
                            {formatIndexValue(it.quantity)} {it.unit}
                          </td>
                          <td className="py-2 pr-3 text-right font-mono whitespace-nowrap">
                            {formatUnitPrice(amount / Number(it.quantity), budget.currency)}
                          </td>
                          <td className="py-2 pr-3 text-right font-mono whitespace-nowrap">{formatMoney(amount, budget.currency)}</td>
                          {editable && (
                            <td className="py-1">
                              <span className="flex items-center justify-end gap-1">
                                <MoveButtons
                                  projectId={project.id}
                                  budgetId={budget.id}
                                  kind="item"
                                  id={it.id}
                                  label={it.description}
                                  first={ii === 0}
                                  last={ii === list.length - 1}
                                />
                                <DeleteRowButton
                                  projectId={project.id}
                                  budgetId={budget.id}
                                  kind="item"
                                  id={it.id}
                                  confirmText={`¿Borrar «${it.description}»?`}
                                />
                              </span>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {editable && (
              <Disclosure
                lazy
                defaultOpen={false}
                className="rounded-md border border-dashed border-line"
                summaryClassName="cursor-pointer px-4 py-2 text-sm"
                summary={list.length === 0 ? `Agregar un ítem a ${ch.name}` : "Agregar, editar o renombrar"}
              >
                <div className="flex flex-col gap-5 border-t border-line p-4">
                  <BudgetItemForm chapterId={ch.id} defaultMode={level === "by_chapter" ? "direct" : "analysis"} />
                  {list.map((it) => (
                    <Disclosure
                      key={it.id}
                      lazy
                      defaultOpen={false}
                      className="rounded-md border border-line"
                      summaryClassName="cursor-pointer px-4 py-2 text-sm"
                      summary={`Editar «${it.description}»`}
                    >
                      <div className="border-t border-line p-4">
                        <BudgetItemForm chapterId={ch.id} item={it} />
                      </div>
                    </Disclosure>
                  ))}
                  <div className="flex flex-col gap-3 border-t border-line pt-4">
                    <RenameChapterForm projectId={project.id} budgetId={budget.id} chapterId={ch.id} name={ch.name} />
                    {list.length === 0 && (
                      <DeleteRowButton
                        projectId={project.id}
                        budgetId={budget.id}
                        kind="chapter"
                        id={ch.id}
                        confirmText={`¿Borrar el rubro «${ch.name}»?`}
                      />
                    )}
                  </div>
                </div>
              </Disclosure>
            )}
          </section>
        );
      })}

      {editable ? (
        <section className="card">
          <AddChapterForm projectId={project.id} budgetId={budget.id} />
        </section>
      ) : (
        <p className="text-sm text-muted">Este presupuesto ya no está en borrador: se consulta, pero no se edita.</p>
      )}
    </BudgetEditorProvider>
  );
}
