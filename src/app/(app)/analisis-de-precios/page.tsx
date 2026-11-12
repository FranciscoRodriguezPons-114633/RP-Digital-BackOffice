import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { Disclosure } from "@/components/disclosure";
import { ListSkeleton } from "@/components/skeleton";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrg, hasWorks, requireUser } from "@/lib/dal";
import { formatMoney } from "@/lib/format";
import { CatalogImportForm, UnitAnalysisForm, type CatalogItem } from "../analysis-forms";

export const metadata: Metadata = { title: "Análisis de precios" };

// Con más análisis que esto, la lista avisa y hay que buscar por rubro (queda para cuando haga falta).
const LIST_LIMIT = 500;

type Row = { id: string; code: string; name: string; unit: string; chapter: string; origin: "own" | "catalog" };
type Cost = { analysis_id: string; currency: string; total: string; components: number; unpriced_components: number };

export default function UnitAnalysesPage() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">Análisis de precios</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Cuánto cuesta una unidad de cada tarea (el m² de mampostería, el m³ de hormigón), separada en materiales,
          mano de obra y equipos. Cada componente es un insumo por su rendimiento y su desperdicio; el costo se
          actualiza solo cuando cambia un precio.
        </p>
      </div>
      <Suspense fallback={<ListSkeleton label="Cargando análisis…" rows={6} />}>
        <Analyses />
      </Suspense>
    </div>
  );
}

async function Analyses() {
  await requireUser();
  const org = await getCurrentOrg();
  if (!org) redirect("/proyectos");
  if (!hasWorks(org)) notFound();

  const supabase = await createClient();
  const [{ data, count }, { data: costData }, { data: catalogData }, { data: catalogComponents }] = await Promise.all([
    supabase
      .from("unit_analyses")
      .select("id, code, name, unit, chapter, origin", { count: "exact" })
      .eq("org_id", org.id)
      .order("chapter")
      .order("code")
      .limit(LIST_LIMIT),
    supabase
      .from("unit_analysis_costs")
      .select("analysis_id, currency, total, components, unpriced_components")
      .eq("org_id", org.id)
      .limit(LIST_LIMIT * 2),
    supabase.from("catalog_unit_analyses").select("code, name, unit, chapter, note").order("position").order("code"),
    supabase.from("catalog_components").select("analysis_code"),
  ]);
  const rows = (data ?? []) as Row[];
  const costs = new Map<string, Cost[]>();
  for (const c of (costData ?? []) as Cost[]) {
    const list = costs.get(c.analysis_id);
    if (list) list.push(c);
    else costs.set(c.analysis_id, [c]);
  }
  const chapters = [...new Set(rows.map((r) => r.chapter))];

  // Del catálogo se ofrecen los que la organización todavía no tiene (por código).
  const own = new Set(rows.map((r) => r.code));
  const componentCount = new Map<string, number>();
  for (const c of (catalogComponents ?? []) as { analysis_code: string }[]) {
    componentCount.set(c.analysis_code, (componentCount.get(c.analysis_code) ?? 0) + 1);
  }
  const catalog: CatalogItem[] = ((catalogData ?? []) as Omit<CatalogItem, "components">[])
    .filter((c) => !own.has(c.code))
    .map((c) => ({ ...c, components: componentCount.get(c.code) ?? 0 }));

  return (
    <>
      <section className="card flex flex-col gap-4">
        <Disclosure
          defaultOpen={rows.length === 0}
          className="rounded-md border border-dashed border-line"
          summary="Nuevo análisis de precio"
          summaryClassName="cursor-pointer px-4 py-3 text-sm font-medium"
        >
          <div className="border-t border-line p-4">
            <UnitAnalysisForm chapters={chapters} />
          </div>
        </Disclosure>

        {rows.length === 0 ? (
          <p className="text-sm text-muted">
            Todavía no hay análisis de precios. Creá el primero{catalog.length > 0 && " o importá uno del catálogo"}.
          </p>
        ) : (
          chapters.map((chapter) => (
            <div key={chapter} className="flex flex-col gap-1">
              <h2 className="text-sm font-medium text-muted">{chapter}</h2>
              <ul className="flex flex-col divide-y divide-line">
                {rows
                  .filter((r) => r.chapter === chapter)
                  .map((r) => {
                    const list = costs.get(r.id) ?? [];
                    const unpriced = list.reduce((n, c) => n + c.unpriced_components, 0);
                    return (
                      <li key={r.id}>
                        <Link
                          href={`/analisis-de-precios/${r.id}`}
                          className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-3 outline-none hover:bg-hover focus-visible:ring-3 focus-visible:ring-focus"
                        >
                          <span className="font-mono text-sm text-muted">{r.code}</span>
                          <span className="min-w-0 flex-1 font-medium">
                            {r.name}
                            {unpriced > 0 && (
                              <span className="ml-2 text-xs font-normal text-warn">
                                {unpriced === 1 ? "1 insumo sin precio" : `${unpriced} insumos sin precio`}
                              </span>
                            )}
                          </span>
                          <span className="font-mono whitespace-nowrap">
                            {list.length === 0 ? (
                              <span className="font-sans text-sm text-muted">Sin componentes</span>
                            ) : (
                              list.map((c) => formatMoney(c.total, c.currency)).join(" + ")
                            )}
                            <span className="text-sm text-muted"> / {r.unit}</span>
                          </span>
                        </Link>
                      </li>
                    );
                  })}
              </ul>
            </div>
          ))
        )}
        {(count ?? 0) > rows.length && (
          <p className="text-xs text-muted">
            Se muestran {rows.length} de {count} análisis.
          </p>
        )}
      </section>

      <section className="card flex flex-col gap-4">
        <div>
          <h2 className="font-medium">Catálogo para importar</h2>
          <p className="mt-1 text-sm text-muted">
            Análisis de base para no empezar de cero. Al importarlos quedan como propios: los adaptás sin tocar el
            catálogo. Los insumos se emparejan por código con los tuyos; los que te falten se crean sin precio.
          </p>
        </div>
        {catalog.length === 0 ? (
          <p className="text-sm text-muted">
            {(catalogData ?? []).length === 0 ? "El catálogo todavía no tiene análisis cargados." : "Ya importaste todo el catálogo."}
          </p>
        ) : org.role === "owner" ? (
          <CatalogImportForm items={catalog} />
        ) : (
          <p className="text-sm text-muted">
            Hay {catalog.length} análisis para importar. Los importa el dueño.
          </p>
        )}
      </section>
    </>
  );
}
