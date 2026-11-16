import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Disclosure } from "@/components/disclosure";
import { PageSkeleton } from "@/components/skeleton";
import { StatusPill } from "@/components/status-pill";
import { createClient } from "@/lib/supabase/server";
import {
  COST_CLASS_LABEL,
  FEES_MODE_LABEL,
  MARKUP_METHOD_LABEL,
  OVERHEAD_KIND_LABEL,
  type CostClass,
  INDEX_MODE_LABEL,
  type FeesMode,
  type IndexMode,
  type MarkupMethod,
} from "@/lib/budgets";
import {
  formatArea,
  formatCostPerM2,
  formatDate,
  formatIndexValue,
  formatMoney,
  formatPeriod,
  formatUnitPrice,
  sumAmounts,
  todayInCordoba,
} from "@/lib/format";
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
import { loadWorksProject } from "../../project-header";
import { SummaryTable, TOTALS_SELECT, type Totals } from "./budget-summary";
import { CountUp } from "@/components/motion/count-up";
import { FileSpreadsheet, GitCompare, Pencil, Plus, Printer } from "lucide-react";
import { PanelButton } from "@/components/ui/panel-button";
import { PillNav } from "@/components/ui/pill-nav";
import {
  CopyBudgetButton,
  DeleteOverheadButton,
  FeesForm,
  IndexForm,
  IssueBudgetButton,
  MarkupForm,
  OverheadForm,
  OverheadTemplateButton,
  type OverheadValues,
} from "../../../../budget-price-forms";

export const metadata: Metadata = { title: "Presupuesto" };

type Budget = {
  id: string;
  number: number;
  level: BudgetLevel;
  status: BudgetStatus;
  currency: string;
  exchange_rate: string | null;
  created_at: string;
  overhead_pct: string;
  profit_pct: string;
  tax_pct: string;
  markup_method: MarkupMethod;
  fees_mode: FeesMode;
  fees_hours: string | null;
  fees_hourly_rate: string | null;
  issued_at: string | null;
  copied_from: string | null;
  index_mode: IndexMode;
  index_base_period: string | null;
  index_general: string | null;
  index_materials: string | null;
  index_labor: string | null;
};
type Adjusted = {
  general_factor: string | null;
  general_period: string | null;
  materials_factor: string | null;
  materials_period: string | null;
  labor_factor: string | null;
  labor_period: string | null;
  missing: string[];
  adjusted_cost: string | null;
  adjusted_price: string | null;
  adjusted_price_per_m2: string | null;
};

type Chapter = { id: string; name: string; position: number };
type Item = ItemValues & { position: number; unit_analyses: { code: string; name: string } | null };
type ItemCost = Record<CostClass, string> & { item_id: string; total: string; unpriced_components: number; missing_rate: boolean };

// Análisis que se ofrecen en el formulario de ítems.
const ANALYSES_LIMIT = 500;

export default function BudgetPage({ params, searchParams }: PageProps<"/proyectos/[id]/presupuestos/[budgetId]">) {
  return (
    <Suspense fallback={<PageSkeleton label="Cargando presupuesto…" title={false} cards={3} list={false} />}>
      <BudgetEditor params={params} searchParams={searchParams} />
    </Suspense>
  );
}

// Dos vistas: los ítems por rubro (?vista vacío) y lo que lleva del costo al precio (?vista=precio).
async function BudgetEditor({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; budgetId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id, budgetId }, query] = await Promise.all([params, searchParams]);
  const view = query.vista === "precio" ? "price" : "items";
  if (!idSchema.safeParse(budgetId).success) notFound();
  const { project, org } = await loadWorksProject(id);
  const supabase = await createClient();

  const [{ data: budget }, { data: totals }, { data: chapterData }, { data: itemData }, { data: costData }] = await Promise.all([
    supabase
      .from("budgets")
      .select(
        "id, number, level, status, currency, exchange_rate, created_at, overhead_pct, profit_pct, tax_pct, markup_method, " +
          "fees_mode, fees_hours, fees_hourly_rate, issued_at, copied_from, index_mode, index_base_period, index_general, " +
          "index_materials, index_labor",
      )
      .eq("id", budgetId)
      .eq("project_id", id)
      .maybeSingle<Budget>(),
    supabase
      .from("budget_totals")
      .select(TOTALS_SELECT)
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

  const level = budget.level as Exclude<BudgetLevel, "parametric">;

  // Personal e indirectos, y lo que suman hoy las etapas de honorarios (solo en la vista de precio).
  let overheads: OverheadValues[] = [];
  let stagesSummary: string | null = null;
  let adjusted: Adjusted | null = null;
  let indexNames: string[] = [];
  if (view === "price") {
    const [{ data: overheadData }, { data: stageData }, { data: adjustedData }, { data: nameData }] = await Promise.all([
      supabase
        .from("budget_overheads")
        .select("id, kind, concept, months, monthly_cost")
        .eq("budget_id", budgetId)
        .order("position")
        .order("created_at"),
      supabase.from("fee_stage_summary").select("currency, total_amount").eq("project_id", id),
      supabase
        .from("budget_adjusted_totals")
        .select(
          "general_factor, general_period, materials_factor, materials_period, labor_factor, labor_period, missing, " +
            "adjusted_cost, adjusted_price, adjusted_price_per_m2",
        )
        .eq("budget_id", budgetId)
        .maybeSingle<Adjusted>(),
      supabase.from("price_index_names").select("name").eq("org_id", org.id).order("name"),
    ]);
    overheads = (overheadData ?? []) as OverheadValues[];
    adjusted = adjustedData ?? null;
    indexNames = ((nameData ?? []) as { name: string }[]).map((n) => n.name);
    const byCurrency = new Map<string, (string | null)[]>();
    for (const st of (stageData ?? []) as { currency: string; total_amount: string | null }[]) {
      byCurrency.set(st.currency, [...(byCurrency.get(st.currency) ?? []), st.total_amount]);
    }
    stagesSummary =
      byCurrency.size === 0
        ? null
        : [...byCurrency.entries()].map(([currency, list]) => formatMoney(sumAmounts(list), currency)).join(" y ");
  }

  return (
    <BudgetEditorProvider value={{ projectId: project.id, budgetId: budget.id, currency: budget.currency, rate, analyses }}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 grow basis-72 flex-wrap items-baseline gap-x-3 gap-y-1">
          <Link href={`/proyectos/${project.id}/presupuestos`} className="text-sm text-muted hover:underline">
            Presupuestos
          </Link>
          <span className="text-sm text-muted">/</span>
          <h2 className="text-lg font-semibold">
            V{budget.number} · {BUDGET_LEVEL_LABEL[level]}
          </h2>
          <StatusPill tone={editable ? "neutral" : "accent"} struck={budget.status === "superseded" || budget.status === "void"}>
            {BUDGET_STATUS_LABEL[budget.status]}
          </StatusPill>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          {editable && <IssueBudgetButton projectId={project.id} budgetId={budget.id} number={budget.number} />}
          {budget.status !== "void" && (
            <CopyBudgetButton projectId={project.id} budgetId={budget.id} number={budget.number} draft={editable} />
          )}
          {budget.copied_from && (
            <Link
              href={`/proyectos/${project.id}/presupuestos/comparar?a=${budget.copied_from}&b=${budget.id}`}
              className="btn btn-secondary"
            >
              <GitCompare aria-hidden="true" size={16} />
              Comparar
            </Link>
          )}
          <Link href={`/proyectos/${project.id}/presupuestos/${budget.id}/imprimir`} className="btn btn-secondary">
            <Printer aria-hidden="true" size={16} />
            Imprimir o PDF
          </Link>
          {/* Descarga un archivo: enlace común, sin navegación del cliente. */}
          <a href={`/proyectos/${project.id}/presupuestos/${budget.id}/exportar`} className="btn btn-secondary">
            <FileSpreadsheet aria-hidden="true" size={16} />
            Excel
          </a>
        </div>
      </div>
      {budget.issued_at && (
        <p className="-mt-3 text-xs text-muted">
          Emitido el {formatDate(todayInCordoba(new Date(budget.issued_at)))}: los montos quedaron fijos ese día y no siguen los
          precios de los insumos.
        </p>
      )}

      <PriceSummary totals={totals} currency={budget.currency}>
        {editable ? (
          <BudgetExchangeRateForm projectId={project.id} budgetId={budget.id} rate={budget.exchange_rate} />
        ) : (
          <p className="text-muted">
            Tipo de cambio: {rate === null ? "sin cargar" : `${formatIndexValue(rate)} pesos por dólar`}
          </p>
        )}
      </PriceSummary>

      <PillNav
        label="Partes del presupuesto"
        items={[
          { href: `?`, label: `Ítems por rubro`, count: totals.items, current: view === "items" },
          { href: `?vista=precio`, label: "Indirectos, honorarios y pase", current: view === "price" },
        ]}
      />

      {view === "price" && (
        <PriceSetup
          projectId={project.id}
          budget={budget}
          totals={totals}
          overheads={overheads}
          stagesSummary={stagesSummary}
          editable={editable}
        />
      )}
      {view === "price" && (
        <IndexCard projectId={project.id} budget={budget} totals={totals} adjusted={adjusted} indexNames={indexNames} />
      )}

      {view === "items" && chapters.map((ch, ci) => {
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

      {!editable ? (
        <p className="text-sm text-muted">Este presupuesto ya no está en borrador: se consulta, pero no se edita.</p>
      ) : view === "items" ? (
        <section className="card">
          <AddChapterForm projectId={project.id} budgetId={budget.id} />
        </section>
      ) : null}
    </BudgetEditorProvider>
  );
}

// Del costo directo al precio sin IVA, en una tabla: cada fila con su monto (y su parte del costo
// directo, en las partes). Las filas en cero no se muestran.
function PriceSummary({ totals, currency, children }: { totals: Totals; currency: string; children: ReactNode }) {
  const price = Number(totals.price ?? 0);

  return (
    <section className="card flex flex-col gap-4" aria-label="Resumen del presupuesto">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-1">
        <div>
          <p className="text-sm font-semibold text-muted">Precio sin IVA</p>
          <p className="font-mono text-3xl font-semibold">
            <CountUp value={price} currency={currency} />
          </p>
        </div>
        <p className="font-mono text-sm text-muted">
          {formatCostPerM2(totals.price_per_m2, currency)} · {formatArea(totals.weighted_m2)} ponderados
        </p>
      </div>

      <SummaryTable totals={totals} currency={currency} className="max-w-xl" />

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
      {totals.overheads_unpriced > 0 && (
        <p className="rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">
          {totals.overheads_unpriced === 1 ? "Un concepto" : `${totals.overheads_unpriced} conceptos`} de personal e
          indirectos no {totals.overheads_unpriced === 1 ? "tiene" : "tienen"} costo mensual y no{" "}
          {totals.overheads_unpriced === 1 ? "suma" : "suman"}.{" "}
          <Link href="?vista=precio" className="underline">
            Completalos
          </Link>
        </p>
      )}
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3 border-t border-line pt-4 text-sm">
        {children}
        <p className="max-w-md text-xs text-muted">
          Los insumos y los honorarios en otra moneda se pasan a {currency} con este tipo de cambio. Mientras está en
          borrador, los montos siguen los precios de los insumos.
        </p>
      </div>
    </section>
  );
}

// Vista de precio: personal e indirectos por mes de obra, honorarios y pase.
function PriceSetup({
  projectId,
  budget,
  totals,
  overheads,
  stagesSummary,
  editable,
}: {
  projectId: string;
  budget: Budget;
  totals: Totals;
  overheads: OverheadValues[];
  stagesSummary: string | null;
  editable: boolean;
}) {
  const ids = { projectId, budgetId: budget.id, currency: budget.currency };
  const staffAndIndirect = Number(totals.overheads_staff) + Number(totals.overheads_indirect);

  return (
    <>
      <section className="card flex flex-col gap-4" aria-labelledby="indirectos">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 grow basis-72">
            <h2 id="indirectos" className="font-bold">
              Personal e indirectos
            </h2>
            <p className="mt-1 text-sm text-muted">
              Lo que cuesta la obra por mes y no está en ningún ítem: capataz, sereno, obrador, seguros. Meses × costo
              mensual, en {budget.currency}.
            </p>
          </div>
          {editable && (
            <PanelButton label="Agregar" title="Nuevo concepto" eyebrow="Personal e indirectos" icon={<Plus aria-hidden="true" size={16} />}>
              <OverheadForm {...ids} />
            </PanelButton>
          )}
        </div>
        {overheads.length === 0 ? (
          <div className="flex flex-col items-start gap-3 text-sm text-muted">
            <p>Todavía no hay personal ni indirectos.</p>
            {editable && <OverheadTemplateButton projectId={projectId} budgetId={budget.id} />}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-left text-muted">
                  <th className="py-2 pr-4 font-medium">Concepto</th>
                  <th className="py-2 pr-4 text-right font-medium">Meses</th>
                  <th className="py-2 pr-4 text-right font-medium">Por mes</th>
                  <th className="py-2 pr-4 text-right font-medium">Total</th>
                  {editable && <th className="py-2 font-medium"><span className="sr-only">Editar</span></th>}
                </tr>
              </thead>
              <tbody>
                {overheads.map((o) => (
                  <tr key={o.id} className="border-b border-line align-top last:border-0">
                    <td className="py-2 pr-4">
                      <span className="font-medium">{o.concept}</span>
                      <span className="block text-xs text-muted">{OVERHEAD_KIND_LABEL[o.kind]}</span>
                    </td>
                    <td className="py-2 pr-4 text-right font-mono">{formatIndexValue(o.months)}</td>
                    <td className="py-2 pr-4 text-right font-mono whitespace-nowrap">
                      {o.monthly_cost === null ? <span className="font-sans text-warn">Sin costo</span> : formatMoney(o.monthly_cost, budget.currency)}
                    </td>
                    <td className="py-2 pr-4 text-right font-mono whitespace-nowrap">
                      {o.monthly_cost === null ? "—" : formatMoney(Math.round(Number(o.months) * Number(o.monthly_cost) * 100) / 100, budget.currency)}
                    </td>
                    {editable && (
                      <td className="py-1 text-right">
                        <PanelButton
                          label="Editar"
                          title={`Editar «${o.concept}»`}
                          eyebrow="Personal e indirectos"
                          variant="ghost"
                          size="sm"
                          icon={<Pencil aria-hidden="true" size={14} />}
                        >
                          <div className="flex flex-col gap-4">
                            <OverheadForm {...ids} overhead={o} />
                            <DeleteOverheadButton projectId={projectId} budgetId={budget.id} id={o.id} concept={o.concept} />
                          </div>
                        </PanelButton>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="pt-3 pr-4 font-medium">Total</td>
                  <td colSpan={2} />
                  <td className="pt-3 pr-4 text-right font-mono font-medium whitespace-nowrap">
                    {formatMoney(staffAndIndirect, budget.currency)}
                  </td>
                  {editable && <td />}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="card flex flex-col gap-4" aria-labelledby="honorarios">
          <div>
            <h2 id="honorarios" className="font-bold">
              Honorarios de arquitectos
            </h2>
            <p className="mt-1 text-sm text-muted">Van en su propia línea, después del pase: el pase no se les aplica.</p>
          </div>
          {editable ? (
            <FeesForm
              {...ids}
              mode={budget.fees_mode}
              hours={budget.fees_hours}
              rate={budget.fees_hourly_rate}
              stagesSummary={stagesSummary}
            />
          ) : (
            <p className="text-sm">
              {FEES_MODE_LABEL[budget.fees_mode]}: <span className="font-mono">{formatMoney(totals.fees_amount, budget.currency)}</span>
            </p>
          )}
          {totals.fees_mode === "stages" && totals.fees_taken_at && (
            <p className="text-xs text-muted">
              Tomados el {new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeZone: "America/Argentina/Cordoba" }).format(new Date(totals.fees_taken_at))}
              : no siguen los cambios de las etapas. Para actualizarlos, volvé a tomarlos.
            </p>
          )}
        </section>

        <section className="card flex flex-col gap-4" aria-labelledby="pase">
          <div>
            <h2 id="pase" className="font-bold">
              Pase
            </h2>
            <p className="mt-1 text-sm text-muted">
              Gastos generales, beneficio e impuestos sobre el costo ({formatMoney(totals.cost, budget.currency)}). Qué
              impuestos van acá lo define el contador.
            </p>
          </div>
          {editable ? (
            <MarkupForm
              {...ids}
              cost={Number(totals.cost)}
              fees={Number(totals.fees_amount)}
              values={{
                overhead_pct: budget.overhead_pct,
                profit_pct: budget.profit_pct,
                tax_pct: budget.tax_pct,
                markup_method: budget.markup_method,
              }}
            />
          ) : (
            <p className="text-sm">
              {MARKUP_METHOD_LABEL[budget.markup_method]}: {formatMoney(totals.markup_amount, budget.currency)}
            </p>
          )}
        </section>
      </div>
    </>
  );
}

// Actualizado por índice: una proyección del presupuesto a hoy, sin cambiar sus montos.
function IndexCard({
  projectId,
  budget,
  totals,
  adjusted,
  indexNames,
}: {
  projectId: string;
  budget: Budget;
  totals: Totals;
  adjusted: Adjusted | null;
  indexNames: string[];
}) {
  const factor = (label: string, name: string | null, f: string | null, period: string | null) =>
    name && (
      <li key={label} className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-subtle">{label}:</span>
        <span className="font-medium">{name}</span>
        <span className="font-mono text-muted">
          {f === null ? "sin valor" : `× ${formatIndexValue(f)}`}
          {period && ` (${formatPeriod(budget.index_base_period)} → ${formatPeriod(period)})`}
        </span>
      </li>
    );
  return (
    <section className="card flex flex-col gap-4" aria-labelledby="ajuste">
      <div>
        <h2 id="ajuste" className="font-bold">
          Actualizado por índice
        </h2>
        <p className="mt-1 text-sm text-muted">
          Cuánto sería hoy, con los índices del mes base al último cargado. No cambia los montos del presupuesto: se puede
          ajustar también después de emitirlo.
        </p>
      </div>
      {adjusted && budget.index_mode !== "none" && (
        <div className="flex flex-col gap-3 rounded-[var(--radius-control)] bg-sunken p-4 text-sm">
          <ul className="flex flex-col gap-1">
            {factor("Materiales", budget.index_materials, adjusted.materials_factor, adjusted.materials_period)}
            {factor("Mano de obra", budget.index_labor, adjusted.labor_factor, adjusted.labor_period)}
            {factor(budget.index_mode === "by_part" ? "El resto" : "Todo el costo", budget.index_general, adjusted.general_factor, adjusted.general_period)}
          </ul>
          {adjusted.missing.length > 0 ? (
            <p className="text-warn">
              Falta el valor de {formatPeriod(budget.index_base_period)} de {adjusted.missing.join(" y ")}: cargalo en{" "}
              <Link href="/indices" className="underline">
                Índices
              </Link>{" "}
              o elegí otro mes base.
            </p>
          ) : (
            <p>
              Precio sin IVA actualizado:{" "}
              <span className="font-mono text-base font-semibold">{formatMoney(adjusted.adjusted_price, budget.currency)}</span>
              <span className="text-muted">
                {" "}
                · {formatCostPerM2(adjusted.adjusted_price_per_m2, budget.currency)} · antes{" "}
                {formatMoney(totals.price, budget.currency)} ({INDEX_MODE_LABEL[budget.index_mode].toLowerCase()})
              </span>
            </p>
          )}
        </div>
      )}
      {budget.status !== "void" && (
        <IndexForm
          projectId={projectId}
          budgetId={budget.id}
          parametric={false}
          indexNames={indexNames}
          values={{
            mode: budget.index_mode,
            basePeriod: budget.index_base_period ?? `${budget.created_at.slice(0, 7)}-01`,
            general: budget.index_general,
            materials: budget.index_materials,
            labor: budget.index_labor,
          }}
        />
      )}
    </section>
  );
}
