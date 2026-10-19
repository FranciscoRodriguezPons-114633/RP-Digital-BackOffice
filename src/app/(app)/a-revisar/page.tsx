import { Suspense } from "react";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrg, requireUser } from "@/lib/dal";
import { PIECE_SELECT, PieceRow, currentRevisionByDocument, type PieceRowData } from "../proyectos/[id]/pieces-section";

export const metadata: Metadata = { title: "A revisar" };

export default function ToReviewPage() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">A revisar</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Renders, planos de venta y brochures cuya revisión de origen se reemplazó. Decidí si cada pieza sigue
          sirviendo con la revisión nueva o si quedó obsoleta.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-muted">Cargando…</p>}>
        <ToReview />
      </Suspense>
    </div>
  );
}

async function ToReview() {
  await requireUser();
  const org = await getCurrentOrg();
  if (!org) redirect("/proyectos");

  const supabase = await createClient();
  const { data } = await supabase
    .from("dependencies")
    .select(`${PIECE_SELECT}, projects(name)`)
    .eq("org_id", org.id)
    .eq("status", "to_review")
    .order("status_changed_at", { ascending: false });
  const pieces = (data ?? []) as unknown as PieceRowData[];
  if (pieces.length === 0) {
    return <p className="text-sm text-muted">No hay piezas a revisar. Todo lo que circula está al día con la revisión vigente.</p>;
  }
  const current = await currentRevisionByDocument([...new Set(pieces.map((p) => p.project_id))]);

  return (
    <section className="card">
      <ul className="flex flex-col divide-y divide-line">
        {pieces.map((p) => (
          <PieceRow
            key={p.id}
            piece={p}
            canReview
            showProject
            currentCode={p.revisions ? (current.get(p.revisions.document_id)?.code ?? null) : null}
          />
        ))}
      </ul>
    </section>
  );
}
