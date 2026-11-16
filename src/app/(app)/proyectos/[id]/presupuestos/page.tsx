import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { PageSkeleton } from "@/components/skeleton";
import { StatusPill, type PillTone } from "@/components/status-pill";
import { createClient } from "@/lib/supabase/server";
import { formatArea, formatCostPerM2, formatDate, formatMoney, todayInCordoba } from "@/lib/format";
import {
  BUDGET_LEVEL_LABEL,
  BUDGET_STATUS_LABEL,
  QUALITY_LABEL,
  TYPOLOGY_LABEL,
  type BudgetLevel,
  type BudgetStatus,
  type Quality,
  type Typology,
} from "@/lib/validation";
import { ParametricBudgetForm, type WorkValues } from "../../../work-forms";
import { NewItemBudgetForm } from "../../../budget-forms";
import { IndexForm } from "../../../budget-price-forms";
import { PanelButton } from "@/components/ui/panel-button";
import { GitCompare, TrendingUp } from "lucide-react";
import type { IndexMode } from "@/lib/budgets";
import { loadWorksProject } from "../project-header";

export const metadata: Metadata = { title: "Presupuestos" };

export default function BudgetsPage({ params }: PageProps<"/proyectos/[id]/presupuestos">) {
  return (
    <Suspense fallback={<PageSkeleton label="Cargando presupuestos…" title={false} cards={2} list={false} />}>
      <Budgets params={params} />
    </Suspense>
  );
}

type BudgetRow = {
  id: string;
  number: number;
  level: BudgetLevel;
  status: BudgetStatus;
  currency: string;
  covered_m2: string;
  semicovered_m2: string;
  semicovered_factor: string | null;
  typology: Typology;
  typology_coef: string | null;
  quality: Quality;
  quality_coef: string | null;
  reference_cost_m2: string | null;
  reference_date: string | null;
  reference_source: string | null;
  notes: string | null;
  created_at: string;
  index_mode: IndexMode;
  index_base_period: string | null;
  index_general: string | null;
};
type TotalRow = {
  budget_id: string;
  weighted_m2: string;
  total: string;
  cost_per_m2: string;
  items: number;
  price: string;
  price_per_m2: string | null;
};
type AdjustedRow = { budget_id: string; adjusted_price: string | null; missing: string[]; general_period: string | null };

const STATUS_TONE: Record<BudgetStatus, PillTone> = {
  draft: "neutral",
  sent: "warn",
  approved: "ok",
  rejected: "danger",
  contractual: "accent",
  superseded: "neutral",
  void: "neutral",
};

const coefFmt = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 4 });

async function Budgets({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { project, org } = await loadWorksProject(id);
  const supabase = await createClient();
  const [{ data: work }, { data: budgets }, { data: totals }, { data: adjustedData }, { data: nameData }] = await Promise.all([
    supabase
      .from("works")
      .select("covered_m2, semicovered_m2, typology, quality, currency")
      .eq("project_id", id)
      .maybeSingle<Pick<WorkValues, "covered_m2" | "semicovered_m2" | "typology" | "quality" | "currency">>(),
    supabase
      .from("budgets")
      .select(
        "id, number, level, status, currency, covered_m2, semicovered_m2, semicovered_factor, typology, typology_coef, " +
          "quality, quality_coef, reference_cost_m2, reference_date, reference_source, notes, created_at, index_mode, " +
          "index_base_period, index_general",
      )
      .eq("project_id", id)
      .order("number", { ascending: false }),
    supabase
      .from("budget_totals")
      .select("budget_id, weighted_m2, total, cost_per_m2, items, price, price_per_m2")
      .eq("project_id", id),
    supabase.from("budget_adjusted_totals").select("budget_id, adjusted_price, missing, general_period").eq("project_id", id),
    supabase.from("price_index_names").select("name").eq("org_id", org.id).order("name"),
  ]);
  const rows = (budgets ?? []) as unknown as BudgetRow[];
  const adjusted = new Map(((adjustedData ?? []) as AdjustedRow[]).map((a) => [a.budget_id, a]));
  const indexNames = ((nameData ?? []) as { name: string }[]).map((n) => n.name);
  const itemVersions = rows.filter((b) => b.level !== "parametric").length;
  const byId = new Map(((totals ?? []) as TotalRow[]).map((t) => [t.budget_id, t]));

  let coefs = { typology: "1", quality: "1" };
  if (work) {
    const { data } = await supabase
      .from("parametric_coefficients")
      .select("dimension, key, value")
      .eq("org_id", org.id)
      .in("key", [work.typology, work.quality]);
    for (const c of (data ?? []) as { dimension: "typology" | "quality"; key: string; value: string }[]) {
      coefs = { ...coefs, [c.dimension]: c.value };
    }
  }

  return (
    <>
      {!work ? (
        <section className="card flex flex-col items-start gap-3">
          <h2 className="font-bold">Primero, la ficha de obra</h2>
          <p className="text-sm text-muted">La estimación sale de los m², la tipología y la calidad de la obra.</p>
          <Link href={`/proyectos/${project.id}/obra`} className="btn btn-primary">
            Completar la ficha
          </Link>
        </section>
      ) : (
        <section className="card flex flex-col gap-4">
          <div>
            <h2 className="font-bold">Nueva estimación paramétrica</h2>
            <p className="mt-1 text-sm text-muted">
              Un orden de magnitud para el croquis: {formatArea(work.covered_m2)} cubiertos
              {Number(work.semicovered_m2) > 0 && ` y ${formatArea(work.semicovered_m2)} semicubiertos`},{" "}
              {TYPOLOGY_LABEL[work.typology].toLowerCase()}, calidad {QUALITY_LABEL[work.quality].toLowerCase()}.{" "}
              <Link href={`/proyectos/${project.id}/obra`} className="underline">
                Cambiar la ficha
              </Link>
            </p>
          </div>
          <ParametricBudgetForm
            projectId={project.id}
            work={work}
            typologyCoef={coefs.typology}
            qualityCoef={coefs.quality}
            today={todayInCordoba()}
          />
        </section>
      )}

      {work && (
        <section className="card flex flex-col gap-4">
          <div>
            <h2 className="font-bold">Nuevo presupuesto por rubros o por ítem</h2>
            <p className="mt-1 text-sm text-muted">
              Del orden de magnitud al presupuesto: rubros con sus ítems, valorizados con análisis de precios o con un
              precio directo. Toma los m² y la moneda de la ficha.
            </p>
          </div>
          <NewItemBudgetForm projectId={project.id} />
        </section>
      )}

      {rows.length > 0 && (
        <section className="card flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-bold">Versiones</h2>
            {itemVersions >= 2 && (
              <Link href={`/proyectos/${project.id}/presupuestos/comparar`} className="btn btn-secondary btn-sm ml-auto">
                <GitCompare aria-hidden="true" size={14} />
                Comparar versiones
              </Link>
            )}
          </div>
          <ul className="flex flex-col divide-y divide-line">
            {rows.map((b) => {
              const t = byId.get(b.id);
              return (
                <li key={b.id} className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="font-mono text-sm text-muted">V{b.number}</span>
                    {b.level === "parametric" ? (
                      <span className="font-medium">{BUDGET_LEVEL_LABEL[b.level]}</span>
                    ) : (
                      <Link href={`/proyectos/${project.id}/presupuestos/${b.id}`} className="font-medium underline">
                        {BUDGET_LEVEL_LABEL[b.level]}
                      </Link>
                    )}
                    <StatusPill tone={STATUS_TONE[b.status]} struck={b.status === "superseded" || b.status === "void"}>
                      {BUDGET_STATUS_LABEL[b.status]}
                    </StatusPill>
                    <span className="ml-auto text-right">
                      <span className="block font-mono text-lg font-semibold whitespace-nowrap">
                        {formatMoney(b.level === "parametric" ? t?.total : t?.price, b.currency)}
                      </span>
                      {b.level !== "parametric" && t && Number(t.price) !== Number(t.total) && (
                        <span className="block text-xs text-muted">sin IVA · costo directo {formatMoney(t.total, b.currency)}</span>
                      )}
                    </span>
                  </div>
                  {t && (
                    <p className="font-mono text-sm text-muted">
                      {formatCostPerM2(t.cost_per_m2, b.currency)} · {formatArea(t.weighted_m2)} ponderados
                    </p>
                  )}
                  {b.level !== "parametric" ? (
                    <p className="text-xs text-muted">
                      {t?.items ?? 0} {t?.items === 1 ? "ítem" : "ítems"} · creado el {formatDate(b.created_at)}
                    </p>
                  ) : (
                  <p className="text-xs text-muted">
                    Costo de referencia {formatCostPerM2(b.reference_cost_m2, b.currency)} al{" "}
                    {formatDate(b.reference_date)} ({b.reference_source}) · semicubiertos al{" "}
                    {coefFmt.format(Number(b.semicovered_factor) * 100)}% · tipología × {coefFmt.format(Number(b.typology_coef))} ·
                    calidad × {coefFmt.format(Number(b.quality_coef))}
                  </p>
                  )}
                  {b.notes && <p className="text-sm">{b.notes}</p>}
                  {b.level === "parametric" && (
                    <ParametricIndex projectId={project.id} budget={b} adjusted={adjusted.get(b.id)} indexNames={indexNames} />
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}

// El paramétrico actualizado por una serie general (ICC Córdoba o CAC), desde el mes de su
// costo de referencia: cuánto daría hoy, sin cambiar la estimación.
function ParametricIndex({
  projectId,
  budget,
  adjusted,
  indexNames,
}: {
  projectId: string;
  budget: BudgetRow;
  adjusted: AdjustedRow | undefined;
  indexNames: string[];
}) {
  const suggested = indexNames.find((n) => /icc/i.test(n)) ?? indexNames.find((n) => /cac/i.test(n)) ?? null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
      {budget.index_mode !== "none" && adjusted && (
        <span>
          {adjusted.missing.length > 0 ? (
            <span className="text-warn">Falta el valor base de {adjusted.missing.join(" y ")} para actualizarlo.</span>
          ) : (
            <>
              Actualizado por {budget.index_general}
              {adjusted.general_period && ` a ${formatDate(adjusted.general_period).replace(/^1 /, "")}`}:{" "}
              <span className="font-mono font-semibold">{formatMoney(adjusted.adjusted_price, budget.currency)}</span>
            </>
          )}
        </span>
      )}
      {budget.status !== "void" && (
        <PanelButton
          label={budget.index_mode === "none" ? "Actualizar por índice" : "Cambiar el índice"}
          title={`Actualizar la V${budget.number} por índice`}
          eyebrow="Estimación paramétrica"
          variant="ghost"
          size="sm"
          icon={<TrendingUp aria-hidden="true" size={14} />}
        >
          <IndexForm
            projectId={projectId}
            budgetId={budget.id}
            parametric
            indexNames={indexNames}
            values={{
              mode: budget.index_mode === "none" && suggested ? "general" : budget.index_mode,
              basePeriod: budget.index_base_period ?? (budget.reference_date ? `${budget.reference_date.slice(0, 7)}-01` : null),
              general: budget.index_general ?? suggested,
              materials: null,
              labor: null,
            }}
          />
        </PanelButton>
      )}
    </div>
  );
}
