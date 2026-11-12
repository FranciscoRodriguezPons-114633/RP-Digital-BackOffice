import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { CardSkeleton } from "@/components/skeleton";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrg, hasWorks, requireUser } from "@/lib/dal";
import type { SupplyKind } from "@/lib/supplies";
import { idSchema } from "@/lib/validation";
import {
  ComponentsEditor,
  DeleteUnitAnalysisForm,
  UnitAnalysisForm,
  type AnalysisValues,
  type ComponentRow,
} from "../../analysis-forms";

export const metadata: Metadata = { title: "Análisis de precio" };

type ComponentData = {
  supply_id: string;
  yield: string;
  waste_pct: string;
  supplies: { code: string; name: string; kind: SupplyKind; unit: string; currency: string; price: string | null } | null;
};

const plain = (n: string) => String(Number(n)).replace(".", ",");

export default function UnitAnalysisPage({ params }: PageProps<"/analisis-de-precios/[id]">) {
  return (
    <div className="flex flex-col gap-8">
      <Link href="/analisis-de-precios" className="text-sm text-muted hover:underline">← Análisis de precios</Link>
      <Suspense fallback={<CardSkeleton label="Cargando análisis…" lines={8} />}>
        <Analysis params={params} />
      </Suspense>
    </div>
  );
}

async function Analysis({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();
  await requireUser();
  const org = await getCurrentOrg();
  if (!org || !hasWorks(org)) notFound();

  const supabase = await createClient();
  const [{ data: analysis }, { data: componentData }, { data: chapterData }] = await Promise.all([
    supabase
      .from("unit_analyses")
      .select("id, code, name, unit, chapter, default_waste_pct, notes, origin")
      .eq("id", id)
      .eq("org_id", org.id)
      .maybeSingle<AnalysisValues & { origin: "own" | "catalog" }>(),
    supabase
      .from("unit_analysis_components")
      .select("supply_id, yield, waste_pct, supplies(code, name, kind, unit, currency, price)")
      .eq("analysis_id", id)
      .order("position"),
    supabase.from("unit_analyses").select("chapter").eq("org_id", org.id).limit(500),
  ]);
  if (!analysis) notFound();

  const initial: ComponentRow[] = ((componentData ?? []) as unknown as ComponentData[])
    .filter((c) => c.supplies)
    .map((c) => ({ supply_id: c.supply_id, ...c.supplies!, yield: plain(c.yield), waste: plain(c.waste_pct) }));
  const chapters = [...new Set(((chapterData ?? []) as { chapter: string }[]).map((c) => c.chapter))].sort((a, b) =>
    a.localeCompare(b, "es"),
  );

  return (
    <>
      <header>
        <h1 className="text-2xl font-semibold">{analysis.name}</h1>
        <p className="mt-1 text-sm text-muted">
          <span className="font-mono">{analysis.code}</span> · {analysis.chapter} · por {analysis.unit}
          {analysis.origin === "catalog" && " · importado del catálogo"}
        </p>
      </header>

      <section className="card flex flex-col gap-4">
        <div>
          <h2 className="font-medium">Componentes</h2>
          <p className="mt-1 text-sm text-muted">
            Cada insumo con su rendimiento (cuánto se usa por {analysis.unit}) y su desperdicio. Costo = rendimiento ×
            (1 + desperdicio) × precio del insumo.
          </p>
        </div>
        <ComponentsEditor
          key={analysis.id}
          analysisId={analysis.id}
          unit={analysis.unit}
          defaultWastePct={Number(analysis.default_waste_pct)}
          initial={initial}
        />
      </section>

      <section className="card flex flex-col gap-4">
        <h2 className="font-medium">Datos del análisis</h2>
        <UnitAnalysisForm analysis={analysis} chapters={chapters} />
        {org.role === "owner" && (
          <div className="border-t border-line pt-4">
            <DeleteUnitAnalysisForm id={analysis.id} name={analysis.name} />
          </div>
        )}
      </section>
    </>
  );
}
