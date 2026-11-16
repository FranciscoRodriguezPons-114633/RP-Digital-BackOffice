import { Suspense } from "react";
import type { Metadata } from "next";
import { PageSkeleton } from "@/components/skeleton";
import { loadMemberProject } from "../project-header";
import { FeesSection } from "../fees-section";
import { ProfitabilitySection } from "../profitability-section";

export const metadata: Metadata = { title: "Honorarios" };

export default function FeesPage({ params }: PageProps<"/proyectos/[id]/honorarios">) {
  return (
    <Suspense fallback={<PageSkeleton label="Cargando honorarios…" title={false} cards={2} list={false} />}>
      <Fees params={params} />
    </Suspense>
  );
}

async function Fees({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { org, isOwner, works } = await loadMemberProject(id);
  return (
    <div className="reveal-group flex flex-col gap-6">
      <FeesSection projectId={id} isOwner={isOwner} />
      {isOwner && works && <ProfitabilitySection projectId={id} orgId={org.id} />}
    </div>
  );
}
