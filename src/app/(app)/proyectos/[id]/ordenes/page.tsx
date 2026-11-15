import { Suspense } from "react";
import type { Metadata } from "next";
import { PageSkeleton } from "@/components/skeleton";
import { loadMemberProject } from "../project-header";
import { ChangeOrdersSection } from "../change-orders-section";

export const metadata: Metadata = { title: "Órdenes de cambio" };

export default function ChangeOrdersPage({ params, searchParams }: PageProps<"/proyectos/[id]/ordenes">) {
  return (
    <Suspense fallback={<PageSkeleton label="Cargando órdenes de cambio…" title={false} cards={1} />}>
      <ChangeOrders params={params} searchParams={searchParams} />
    </Suspense>
  );
}

// ?etapa=<id> abre el formulario con esa etapa elegida (desde «pasó las horas previstas»).
async function ChangeOrders({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const { isOwner } = await loadMemberProject(id);
  const stage = typeof query.etapa === "string" ? query.etapa : undefined;
  return <ChangeOrdersSection projectId={id} isOwner={isOwner} defaultStageId={stage} />;
}
