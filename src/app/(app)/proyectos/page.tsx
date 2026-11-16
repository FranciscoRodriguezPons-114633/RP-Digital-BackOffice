import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { FolderOpen } from "lucide-react";
import { PageSkeleton } from "@/components/skeleton";
import { createClient } from "@/lib/supabase/server";
import { countGuestProjects, getCurrentOrg, requireUser } from "@/lib/dal";
import { formatDay, formatHours, sumAmounts, todayInCordoba } from "@/lib/format";
import { SubmitButton } from "@/components/form";
import { StatusPill } from "@/components/status-pill";
import { PageHeader } from "@/components/ui/page-header";
import { ProgressBar } from "@/components/ui/progress-bar";
import { EmptyState } from "@/components/ui/empty-state";
import { createSampleProject } from "../actions";
import { daysUntil } from "../vencimientos/deadline-list";
import { NewProjectButton } from "./new-project";

export const metadata: Metadata = { title: "Proyectos" };

type ProjectRow = {
  id: string;
  name: string;
  code: string | null;
  client_name: string | null;
  status: "active" | "archived";
  created_at: string;
  organizations: { name: string } | null;
};

// Lo que se ve de cada proyecto en la lista del estudio.
type Glance = {
  used: number;
  budget: number;
  waiting: number;
  toReview: number;
  next: { title: string; due_date: string } | null;
};

export default function ProjectsPage() {
  return (
    <Suspense fallback={<PageSkeleton label="Cargando proyectos…" cards={0} />}>
      <Projects />
    </Suspense>
  );
}

// Un Server Component se renderiza una vez por pedido: la hora es estable dentro del render.
function requestTime() {
  return new Date();
}

async function Projects() {
  await requireUser();
  const org = await getCurrentOrg();
  if (!org && (await countGuestProjects()) === 0) redirect("/onboarding");

  const supabase = await createClient();
  const { data } = await supabase
    .from("projects")
    .select("id, name, code, client_name, status, created_at, organizations(name)")
    .order("created_at", { ascending: false });
  const projects = (data ?? []) as unknown as ProjectRow[];
  const active = projects.filter((p) => p.status === "active");
  const archived = projects.filter((p) => p.status === "archived");
  const glances = org ? await loadGlances(org.id) : new Map<string, Glance>();
  const today = todayInCordoba(requestTime());
  const isOwner = org?.role === "owner";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Proyectos"
        meta={org ? `${active.length} ${active.length === 1 ? "activo" : "activos"}` : "Los proyectos a los que te invitaron"}
        actions={org && <NewProjectButton isOwner={isOwner} projects={active.map((p) => ({ id: p.id, name: p.name }))} />}
      />

      {!org && (
        <p className="text-sm text-muted">
          Si querés gestionar los tuyos,{" "}
          <Link href="/onboarding" className="font-semibold text-accent underline">
            creá tu estudio
          </Link>
          .
        </p>
      )}

      {projects.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title="Todavía no hay proyectos"
          action={
            isOwner && (
              <form action={createSampleProject}>
                <SubmitButton variant="ghost" pendingLabel="Creando…">Ver uno de ejemplo</SubmitButton>
              </form>
            )
          }
        >
          {isOwner
            ? "Creá el primero con «Nuevo proyecto», o mirá uno de ejemplo con etapas, planos, una orden de cambio y un vencimiento (lo podés borrar cuando quieras)."
            : "Cuando el estudio cree uno, aparece acá."}
        </EmptyState>
      ) : (
        <ProjectGrid projects={active} glances={glances} today={today} member={!!org} />
      )}

      {archived.length > 0 && (
        <section className="flex flex-col gap-3" aria-labelledby="archivados">
          <h2 id="archivados" className="text-sm font-semibold text-muted">
            Archivados
          </h2>
          <ProjectGrid projects={archived} glances={glances} today={today} member={!!org} />
        </section>
      )}
    </div>
  );
}

// Horas, órdenes esperando, piezas a revisar y el próximo vencimiento de cada proyecto del
// estudio, en cuatro consultas para toda la lista.
async function loadGlances(orgId: string) {
  const supabase = await createClient();
  const [{ data: stages }, { data: orders }, { data: pieces }, { data: deadlines }] = await Promise.all([
    supabase.from("fee_stage_summary").select("project_id, hours_used, budget_hours").eq("org_id", orgId),
    supabase.from("change_orders").select("project_id").eq("org_id", orgId).eq("status", "sent"),
    supabase.from("dependencies").select("project_id").eq("org_id", orgId).eq("status", "to_review"),
    supabase
      .from("deadlines")
      .select("project_id, title, due_date")
      .eq("org_id", orgId)
      .is("done_at", null)
      .not("project_id", "is", null)
      .order("due_date"),
  ]);
  const map = new Map<string, Glance>();
  const get = (id: string) => {
    let g = map.get(id);
    if (!g) map.set(id, (g = { used: 0, budget: 0, waiting: 0, toReview: 0, next: null }));
    return g;
  };
  for (const s of (stages ?? []) as { project_id: string; hours_used: string; budget_hours: string | null }[]) {
    const g = get(s.project_id);
    g.used = sumAmounts([g.used, s.hours_used]);
    g.budget = sumAmounts([g.budget, s.budget_hours]);
  }
  for (const o of (orders ?? []) as { project_id: string }[]) get(o.project_id).waiting++;
  for (const p of (pieces ?? []) as { project_id: string }[]) get(p.project_id).toReview++;
  for (const d of (deadlines ?? []) as { project_id: string; title: string; due_date: string }[]) {
    const g = get(d.project_id);
    if (!g.next) g.next = { title: d.title, due_date: d.due_date };
  }
  return map;
}

function ProjectGrid({
  projects,
  glances,
  today,
  member,
}: {
  projects: ProjectRow[];
  glances: Map<string, Glance>;
  today: string;
  member: boolean;
}) {
  if (projects.length === 0) return null;
  return (
    <ul className="reveal-group grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {projects.map((p) => (
        <li key={p.id}>
          <ProjectCard project={p} glance={glances.get(p.id)} today={today} member={member} />
        </li>
      ))}
    </ul>
  );
}

// Tarjeta entera clickeable, pero el link es solo el nombre (así se lee bien con lector de
// pantalla): su ::after cubre la tarjeta.
function ProjectCard({
  project: p,
  glance,
  today,
  member,
}: {
  project: ProjectRow;
  glance: Glance | undefined;
  today: string;
  member: boolean;
}) {
  const pct = glance && glance.budget > 0 ? Math.round((1000 * glance.used) / glance.budget) / 10 : null;
  const days = glance?.next ? daysUntil(glance.next.due_date, today) : null;
  const meta = [p.code, member ? p.client_name : p.organizations?.name].filter(Boolean).join(" · ");

  return (
    <article className="card relative flex h-full flex-col gap-3 transition-shadow hover:shadow-md">
      <div className="flex items-start gap-3">
        <h2 className="min-w-0 flex-1 text-base font-bold">
          <Link
            href={`/proyectos/${p.id}`}
            className="outline-none after:absolute after:inset-0 after:rounded-[var(--radius-card)] after:content-[''] focus-visible:after:ring-3 focus-visible:after:ring-focus"
          >
            {p.name}
          </Link>
        </h2>
        {p.status === "archived" && <StatusPill>Archivado</StatusPill>}
      </div>
      {meta && <p className="-mt-2 text-sm text-muted">{meta}</p>}

      {member && glance && (
        <>
          <div className="flex flex-col gap-1.5">
            <ProgressBar pct={pct} size="sm" />
            <p className="tabular text-xs text-muted">
              {pct === null
                ? `${formatHours(glance.used)} cargadas · sin horas previstas`
                : `${formatHours(glance.used)} de ${formatHours(glance.budget)} · ${String(pct).replace(".", ",")} %`}
            </p>
          </div>
          <div className="mt-auto flex flex-wrap gap-1.5">
            {glance.waiting > 0 && (
              <StatusPill tone="warn">
                {glance.waiting === 1 ? "1 orden esperando" : `${glance.waiting} órdenes esperando`}
              </StatusPill>
            )}
            {glance.toReview > 0 && (
              <StatusPill tone="info">
                {glance.toReview === 1 ? "1 pieza a revisar" : `${glance.toReview} piezas a revisar`}
              </StatusPill>
            )}
            {glance.next && days !== null && (
              <StatusPill tone={days < 0 ? "danger" : days <= 5 ? "warn" : "neutral"}>
                {days < 0 ? "Venció" : "Vence"} {formatDay(glance.next.due_date)}
              </StatusPill>
            )}
          </div>
        </>
      )}
    </article>
  );
}
