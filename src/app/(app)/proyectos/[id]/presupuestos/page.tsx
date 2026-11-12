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
import { ProjectTabs, ProjectTitle, loadWorksProject } from "../project-header";

export const metadata: Metadata = { title: "Presupuestos" };

export default function BudgetsPage({ params }: PageProps<"/proyectos/[id]/presupuestos">) {
  return (
    <div className="flex flex-col gap-8">
      <Link href="/proyectos" className="text-sm text-muted hover:underline">← Proyectos</Link>
      <Suspense fallback={<PageSkeleton label="Cargando presupuestos…" cards={2} list={false} />}>
        <Budgets params={params} />
      </Suspense>
    </div>
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
  semicovered_factor: string;
  typology: Typology;
  typology_coef: string;
  quality: Quality;
  quality_coef: string;
  reference_cost_m2: string;
  reference_date: string;
  reference_source: string;
  notes: string | null;
  created_at: string;
};
type TotalRow = { budget_id: string; weighted_m2: string; total: string; cost_per_m2: string };

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

function requestTime() {
  return new Date();
}

async function Budgets({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { project, org } = await loadWorksProject(id);
  const supabase = await createClient();
  const [{ data: work }, { data: budgets }, { data: totals }] = await Promise.all([
    supabase
      .from("works")
      .select("covered_m2, semicovered_m2, typology, quality, currency")
      .eq("project_id", id)
      .maybeSingle<Pick<WorkValues, "covered_m2" | "semicovered_m2" | "typology" | "quality" | "currency">>(),
    supabase
      .from("budgets")
      .select(
        "id, number, level, status, currency, covered_m2, semicovered_m2, semicovered_factor, typology, typology_coef, " +
          "quality, quality_coef, reference_cost_m2, reference_date, reference_source, notes, created_at",
      )
      .eq("project_id", id)
      .order("number", { ascending: false }),
    supabase.from("budget_totals").select("budget_id, weighted_m2, total, cost_per_m2").eq("project_id", id),
  ]);
  const rows = (budgets ?? []) as unknown as BudgetRow[];
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
      <ProjectTitle project={project} />
      <ProjectTabs projectId={project.id} active="budgets" />

      {!work ? (
        <section className="card flex flex-col items-start gap-3">
          <h2 className="font-medium">Primero, la ficha de obra</h2>
          <p className="text-sm text-muted">La estimación sale de los m², la tipología y la calidad de la obra.</p>
          <Link href={`/proyectos/${project.id}/obra`} className="btn btn-primary">
            Completar la ficha
          </Link>
        </section>
      ) : (
        <section className="card flex flex-col gap-4">
          <div>
            <h2 className="font-medium">Nueva estimación paramétrica</h2>
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
            today={todayInCordoba(requestTime())}
          />
        </section>
      )}

      {rows.length > 0 && (
        <section className="card flex flex-col gap-4">
          <h2 className="font-medium">Versiones</h2>
          <ul className="flex flex-col divide-y divide-line">
            {rows.map((b) => {
              const t = byId.get(b.id);
              return (
                <li key={b.id} className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="font-mono text-sm text-muted">V{b.number}</span>
                    <span className="font-medium">{BUDGET_LEVEL_LABEL[b.level]}</span>
                    <StatusPill tone={STATUS_TONE[b.status]} struck={b.status === "superseded" || b.status === "void"}>
                      {BUDGET_STATUS_LABEL[b.status]}
                    </StatusPill>
                    <span className="ml-auto font-mono text-lg font-semibold whitespace-nowrap">
                      {formatMoney(t?.total, b.currency)}
                    </span>
                  </div>
                  {t && (
                    <p className="font-mono text-sm text-muted">
                      {formatCostPerM2(t.cost_per_m2, b.currency)} · {formatArea(t.weighted_m2)} ponderados
                    </p>
                  )}
                  <p className="text-xs text-muted">
                    Costo de referencia {formatCostPerM2(b.reference_cost_m2, b.currency)} al{" "}
                    {formatDate(b.reference_date)} ({b.reference_source}) · semicubiertos al{" "}
                    {coefFmt.format(Number(b.semicovered_factor) * 100)}% · tipología × {coefFmt.format(Number(b.typology_coef))} ·
                    calidad × {coefFmt.format(Number(b.quality_coef))}
                  </p>
                  {b.notes && <p className="text-sm">{b.notes}</p>}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}
