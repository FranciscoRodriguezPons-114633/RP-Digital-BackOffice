"use client";

import { useSelectedLayoutSegment } from "next/navigation";
import { PillNav } from "@/components/ui/pill-nav";

// Pestañas del proyecto. La activa sale del segmento de la URL debajo de /proyectos/[id]
// (null en la portada). Obra y Presupuestos solo con Finanzas de obra.
const SECTIONS: { segment: string | null; label: string; works?: boolean }[] = [
  { segment: null, label: "Resumen" },
  { segment: "honorarios", label: "Honorarios" },
  { segment: "ordenes", label: "Órdenes de cambio" },
  { segment: "documentos", label: "Documentos" },
  { segment: "obra", label: "Obra", works: true },
  { segment: "presupuestos", label: "Presupuestos", works: true },
  { segment: "invitados", label: "Invitados" },
  { segment: "historial", label: "Actividad" },
];

export function ProjectNav({ projectId, works, waiting }: { projectId: string; works: boolean; waiting: number }) {
  const active = useSelectedLayoutSegment();
  return (
    <PillNav
      label="Secciones del proyecto"
      items={SECTIONS.filter((s) => works || !s.works).map((s) => ({
        href: `/proyectos/${projectId}${s.segment ? `/${s.segment}` : ""}`,
        label: s.label,
        ...(s.segment === "ordenes" && { count: waiting, countLabel: "esperando respuesta" }),
        current: s.segment === active,
      }))}
    />
  );
}
