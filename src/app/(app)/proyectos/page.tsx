import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { countGuestProjects, getCurrentOrg, requireUser } from "@/lib/dal";
import { ProjectForm } from "../forms";
import { createSampleProject } from "../actions";
import { SubmitButton } from "@/components/form";

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
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-semibold">Proyectos</h1>
      <Suspense fallback={<p className="text-sm text-muted">Cargando proyectos…</p>}>
        <Projects />
      </Suspense>
    </div>
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
        <section className="card">
          <h2 className="mb-4 font-medium">Nuevo proyecto</h2>
          <ProjectForm
            isOwner={org.role === "owner"}
            projects={projects.filter((p) => p.status === "active").map((p) => ({ id: p.id, name: p.name }))}
          />
        </section>
      )}

      {!org && (
        <p className="text-sm text-muted">
          Estos son los proyectos a los que te invitaron. Si querés gestionar los tuyos,{" "}
          <Link href="/onboarding" className="underline">creá tu estudio</Link>.
        </p>
      )}

      {projects.length === 0 ? (
        org?.role === "owner" ? (
          <section className="card flex flex-wrap items-center gap-4">
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
          <p className="text-sm text-muted">Todavía no hay proyectos.</p>
        )
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
          {projects.map((p) => (
            <li key={p.id}>
              <Link href={`/proyectos/${p.id}`} className="flex items-center gap-4 px-4 py-3 hover:bg-hover">
                <span className="font-medium">{p.name}</span>
                {p.code && <span className="text-sm text-muted">{p.code}</span>}
                <span className="ml-auto text-sm text-muted">
                  {org ? (p.client_name ?? "") : (p.organizations?.name ?? "")}
                </span>
                {p.status === "archived" && <span className="badge">Archivado</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
