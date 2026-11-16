import { Suspense } from "react";
import type { Metadata } from "next";
import { Skeleton } from "@/components/skeleton";
import { ProjectHeader, loadProject } from "./project-header";

// La pestaña del navegador dice en qué proyecto y en qué sección se está.
export async function generateMetadata({ params }: LayoutProps<"/proyectos/[id]">): Promise<Metadata> {
  const { id } = await params;
  const { project } = await loadProject(id);
  return { title: { default: project.name, template: `%s · ${project.name} · RP Backoffice` } };
}

// Todas las secciones del proyecto comparten el encabezado y las pestañas. Al pasar de una
// sección a otra solo cambia (y entra con su animación) el contenido de abajo.
export default function ProjectLayout({ children, params }: LayoutProps<"/proyectos/[id]">) {
  return (
    <div className="reveal-group flex flex-col gap-6">
      <Suspense fallback={<HeaderSkeleton />}>
        <ProjectHeader params={params} />
      </Suspense>
      {children}
    </div>
  );
}

function HeaderSkeleton() {
  return (
    <div role="status" className="flex flex-col gap-4">
      <span className="sr-only">Cargando proyecto…</span>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-48" />
      </div>
      <div className="flex gap-1.5">
        {["w-24", "w-28", "w-40", "w-28"].map((w, i) => (
          <Skeleton key={i} className={`h-10 rounded-full ${w}`} />
        ))}
      </div>
    </div>
  );
}
