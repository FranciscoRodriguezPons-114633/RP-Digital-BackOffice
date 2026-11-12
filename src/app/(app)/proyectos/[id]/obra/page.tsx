import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { PageSkeleton } from "@/components/skeleton";
import { createClient } from "@/lib/supabase/server";
import { formatArea, formatDate } from "@/lib/format";
import { QUALITY_LABEL, TYPOLOGY_LABEL, WORK_ROLE_SHORT } from "@/lib/validation";
import { WorkForm, type WorkValues } from "../../../work-forms";
import { ProjectTabs, ProjectTitle, loadWorksProject } from "../project-header";

export const metadata: Metadata = { title: "Obra" };

export default function WorkPage({ params }: PageProps<"/proyectos/[id]/obra">) {
  return (
    <div className="flex flex-col gap-8">
      <Link href="/proyectos" className="text-sm text-muted hover:underline">← Proyectos</Link>
      <Suspense fallback={<PageSkeleton label="Cargando ficha de obra…" cards={1} list={false} />}>
        <Work params={params} />
      </Suspense>
    </div>
  );
}

const WORK_SELECT =
  "org_role, address, city, covered_m2, semicovered_m2, typology, quality, planned_start, planned_end, currency";

async function Work({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { project } = await loadWorksProject(id);
  const supabase = await createClient();
  const { data } = await supabase.from("works").select(WORK_SELECT).eq("project_id", id).maybeSingle<WorkValues>();
  const work = data ?? null;

  return (
    <>
      <ProjectTitle project={project} />
      <ProjectTabs projectId={project.id} active="work" />

      {work && (
        <section className="card flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline gap-3">
            <h2 className="font-medium">{WORK_ROLE_SHORT[work.org_role]}</h2>
            <span className="text-sm text-muted">{[work.address, work.city].filter(Boolean).join(", ")}</span>
            <Link href={`/proyectos/${project.id}/presupuestos`} className="btn btn-primary btn-sm ml-auto">
              Estimar costo
            </Link>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
            <Fact label="Cubiertos" value={formatArea(work.covered_m2)} mono />
            <Fact label="Semicubiertos" value={formatArea(work.semicovered_m2)} mono />
            <Fact label="Tipología" value={TYPOLOGY_LABEL[work.typology]} />
            <Fact label="Calidad" value={QUALITY_LABEL[work.quality]} />
            <Fact label="Inicio previsto" value={formatDate(work.planned_start)} />
            <Fact label="Fin previsto" value={formatDate(work.planned_end)} />
            <Fact label="Moneda" value={work.currency} />
          </dl>
        </section>
      )}

      <section className="card flex flex-col gap-4">
        <div>
          <h2 className="font-medium">{work ? "Editar la ficha" : "Ficha de obra"}</h2>
          <p className="mt-1 text-sm text-muted">
            Los datos base de la obra. Con los m², la tipología y la calidad sale la primera estimación de costo. Los
            invitados del proyecto no la ven.
          </p>
        </div>
        <WorkForm projectId={project.id} work={work} />
      </section>
    </>
  );
}

function Fact({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={mono ? "font-mono" : undefined}>{value}</dd>
    </div>
  );
}
