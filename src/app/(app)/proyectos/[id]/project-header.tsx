import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrg, hasWorks, requireUser } from "@/lib/dal";
import { idSchema } from "@/lib/validation";

export type ProjectTab = "summary" | "work" | "budgets";

const TABS: { key: ProjectTab; label: string; path: string }[] = [
  { key: "summary", label: "Resumen", path: "" },
  { key: "work", label: "Obra", path: "/obra" },
  { key: "budgets", label: "Presupuestos", path: "/presupuestos" },
];

// Pestañas del proyecto. Obra y Presupuestos son de Finanzas de obra: solo se ven si la
// plataforma habilitó «works» para la organización.
export function ProjectTabs({ projectId, active }: { projectId: string; active: ProjectTab }) {
  return (
    <nav aria-label="Secciones del proyecto" className="-mt-4 flex gap-1 overflow-x-auto border-b border-line">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={`/proyectos/${projectId}${t.path}`}
          aria-current={t.key === active ? "page" : undefined}
          className={`-mb-px border-b-2 px-3 py-2 text-sm whitespace-nowrap outline-none focus-visible:ring-3 focus-visible:ring-focus ${
            t.key === active
              ? "border-accent font-medium text-foreground"
              : "border-transparent text-muted hover:text-foreground"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

export type WorksProject = { id: string; org_id: string; name: string; code: string | null; client_name: string | null };

// Proyecto de una pestaña de obra: solo para miembros de una organización con «works».
// Para cualquier otro (invitado, otra organización, sin la función) es como si no existiera.
export async function loadWorksProject(id: string) {
  if (!idSchema.safeParse(id).success) notFound();
  await requireUser();
  const supabase = await createClient();
  const [{ data }, org] = await Promise.all([
    supabase.from("projects").select("id, org_id, name, code, client_name").eq("id", id).maybeSingle<WorksProject>(),
    getCurrentOrg(),
  ]);
  if (!data || org?.id !== data.org_id || !hasWorks(org)) notFound();
  return { project: data, org };
}

export function ProjectTitle({ project }: { project: WorksProject }) {
  return (
    <header>
      <h1 className="text-2xl font-semibold">{project.name}</h1>
      <p className="mt-1 text-sm text-muted">{[project.code, project.client_name].filter(Boolean).join(" · ")}</p>
    </header>
  );
}
