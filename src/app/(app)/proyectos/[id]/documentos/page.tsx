import { Suspense } from "react";
import type { Metadata } from "next";
import { PageSkeleton } from "@/components/skeleton";
import { loadMemberProject } from "../project-header";
import { DocumentsSection } from "../documents-section";
import { PiecesSection } from "../pieces-section";
import { ShipmentsSection } from "../shipments-section";

export const metadata: Metadata = { title: "Documentos" };

export default function DocumentsPage({ params }: PageProps<"/proyectos/[id]/documentos">) {
  return (
    <Suspense fallback={<PageSkeleton label="Cargando documentos…" title={false} cards={3} list={false} />}>
      <Documents params={params} />
    </Suspense>
  );
}

// Planos y documentos con sus revisiones, las piezas que dependen de ellos y lo enviado.
async function Documents({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await loadMemberProject(id);
  return (
    <div className="reveal-group flex flex-col gap-6">
      <DocumentsSection projectId={id} />
      <PiecesSection projectId={id} />
      <ShipmentsSection projectId={id} />
    </div>
  );
}
