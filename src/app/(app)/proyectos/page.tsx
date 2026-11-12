import { Suspense } from "react";
import { PageSkeleton } from "@/components/skeleton";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { countGuestProjects, getCurrentOrg, requireUser } from "@/lib/dal";
import { ProjectForm } from "../forms";
import { createSampleProject } from "../actions";
import { SubmitButton } from "@/components/form";
import { StatusPill } from "@/components/status-pill";
import { PageTransition } from "@/components/motion/page-transition";
import { RevealTitle } from "@/components/motion/reveal-title";
import { reveal, revealFrom } from "@/components/motion/reveal";

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

export default function ProjectsPage() {
  return (
    <PageTransition className="flex flex-col gap-8">
      <RevealTitle text="Proyectos" />
      <Suspense fallback={<PageSkeleton label="Cargando proyectos…" title={false} />}>
        <Projects />
      </Suspense>
    </PageTransition>
  );
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

  return (
    <>
      {org && (
        <section className="card reveal" style={reveal(0)}>
          <h2 className="mb-4 font-medium">Nuevo proyecto</h2>
          <ProjectForm
            isOwner={org.role === "owner"}
            projects={projects.filter((p) => p.status === "active").map((p) => ({ id: p.id, name: p.name }))}
          />
        </section>
      )}

      {!org && (
        <p className="reveal text-sm text-muted" style={reveal(0)}>
          Estos son los proyectos a los que te invitaron. Si querés gestionar los tuyos,{" "}
          <Link href="/onboarding" className="underline">creá tu estudio</Link>.
        </p>
      )}

      {projects.length === 0 ? (
        org?.role === "owner" ? (
          <section className="card reveal flex flex-wrap items-center gap-4" style={reveal(1)}>
            <div className="min-w-0 flex-1">
              <h2 className="font-medium">¿Querés verlo con datos primero?</h2>
              <p className="mt-1 text-sm text-muted">
                Creamos un proyecto de ejemplo con etapas, planos, una orden de cambio y un vencimiento. Lo podés borrar
                cuando quieras.
              </p>
            </div>
            <form action={createSampleProject}>
              <SubmitButton variant="ghost" pendingLabel="Creando…">Crear proyecto de ejemplo</SubmitButton>
            </form>
          </section>
        ) : (
          <p className="reveal text-sm text-muted" style={reveal(1)}>Todavía no hay proyectos.</p>
        )
      ) : (
        <ul className="reveal-group divide-y divide-line rounded-xl border border-line bg-surface" style={revealFrom(1)}>
          {projects.map((p) => (
            <li key={p.id}>
              <Link href={`/proyectos/${p.id}`} className="flex items-center gap-4 px-4 py-3 hover:bg-hover">
                <span className="font-medium">{p.name}</span>
                {p.code && <span className="text-sm text-muted">{p.code}</span>}
                <span className="ml-auto text-sm text-muted">
                  {org ? (p.client_name ?? "") : (p.organizations?.name ?? "")}
                </span>
                {p.status === "archived" && <StatusPill>Archivado</StatusPill>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
