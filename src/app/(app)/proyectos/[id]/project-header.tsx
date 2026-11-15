import { cache } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Clock, Download } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrg, hasWorks, requireUser } from "@/lib/dal";
import { idSchema } from "@/lib/validation";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/status-pill";
import { ProjectNav } from "./project-nav";

export type ProjectRecord = {
  id: string;
  org_id: string;
  name: string;
  code: string | null;
  client_name: string | null;
  status: "active" | "archived";
  organizations: { name: string } | null;
};

// El proyecto y la organización de quien mira. Lo usan el encabezado (layout) y cada sección
// en el mismo pedido: cache() hace una sola consulta. RLS devuelve vacío si no hay acceso, y
// eso se muestra igual que si el proyecto no existiera.
export const loadProject = cache(async (id: string) => {
  if (!idSchema.safeParse(id).success) notFound();
  await requireUser();
  const supabase = await createClient();
  const [{ data: project }, org] = await Promise.all([
    supabase
      .from("projects")
      .select("id, org_id, name, code, client_name, status, organizations(name)")
      .eq("id", id)
      .maybeSingle<ProjectRecord>(),
    getCurrentOrg(),
  ]);
  if (!project) notFound();
  return { project, org, isMember: org?.id === project.org_id };
});

// Secciones del estudio (honorarios, órdenes, documentos…): solo para miembros. Un invitado
// solo tiene la portada del proyecto, y si llega a una sección (por un link de un correo) va
// a la portada, donde está lo que le compartieron.
export async function loadMemberProject(id: string) {
  const { project, org, isMember } = await loadProject(id);
  if (!isMember || !org) redirect(`/proyectos/${project.id}`);
  return { project, org, isOwner: org.role === "owner", works: hasWorks(org) };
}

// Obra y Presupuestos son de Finanzas de obra: solo si la plataforma habilitó «works» para la
// organización. Para cualquier otro es como si no existieran.
export async function loadWorksProject(id: string) {
  const { project, org, works } = await loadMemberProject(id);
  if (!works) notFound();
  return { project, org };
}

// Encabezado común a todas las secciones del proyecto: nombre, datos, acciones y pestañas.
export async function ProjectHeader({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { project, org, isMember } = await loadProject(id);
  const supabase = await createClient();
  const { count: waiting } = isMember
    ? await supabase
        .from("change_orders")
        .select("id", { count: "exact", head: true })
        .eq("project_id", id)
        .eq("status", "sent")
    : { count: 0 };

  return (
    <>
      <PageHeader
        back={{ href: "/proyectos", label: "Proyectos" }}
        title={project.name}
        status={project.status === "archived" ? <StatusPill>Archivado</StatusPill> : null}
        meta={[project.code, project.client_name, !isMember && project.organizations?.name].filter(Boolean).join(" · ")}
        actions={
          isMember && (
            <>
              <Link href={`/horas?proyecto=${project.id}`} className="btn btn-primary">
                <Clock aria-hidden="true" size={16} />
                Cargar horas
              </Link>
              {/* Descarga un archivo: enlace común, sin navegación del cliente. En el teléfono no:
                  la planilla se abre en la computadora. */}
              <a href={`/proyectos/${project.id}/exportar`} className="btn btn-secondary hidden sm:inline-flex">
                <Download aria-hidden="true" size={16} />
                Exportar a Excel
              </a>
            </>
          )
        }
      />
      {isMember && <ProjectNav projectId={project.id} works={hasWorks(org)} waiting={waiting ?? 0} />}
    </>
  );
}
