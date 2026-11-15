import { Suspense } from "react";
import { PageSkeleton } from "@/components/skeleton";
import { hasWorks } from "@/lib/dal";
import { loadProject } from "./project-header";
import { ProjectSummary } from "./summary";
import { GuestView } from "./guest-view";

export default function ProjectPage({ params }: PageProps<"/proyectos/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton label="Cargando resumen…" title={false} cards={2} list={false} />}>
      <ProjectHome params={params} />
    </Suspense>
  );
}

// El estudio ve el resumen del proyecto; un invitado, solo lo que le compartieron.
async function ProjectHome({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { project, org, isMember } = await loadProject(id);
  if (!isMember || !org) return <GuestView projectId={project.id} orgName={project.organizations?.name ?? null} />;
  return <ProjectSummary projectId={project.id} orgId={org.id} isOwner={org.role === "owner"} works={hasWorks(org)} />;
}
