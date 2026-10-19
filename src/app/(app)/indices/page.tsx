import { Suspense } from "react";
import { CardSkeleton } from "@/components/skeleton";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrg, requireUser } from "@/lib/dal";
import { formatIndexValue, formatPeriod } from "@/lib/format";
import { DeleteIndexValueForm, IndexValueForm } from "../co-forms";

export const metadata: Metadata = { title: "Índices" };

type IndexRow = { id: string; name: string; period: string; value: string };

const pctFormatter = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2, signDisplay: "always" });

export default function IndicesPage() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">Índices</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Cargá el valor de cada mes del índice que usás para actualizar honorarios (por ejemplo, el costo de la
          construcción). Cada etapa vinculada se actualiza con el último valor dividido el de su mes base. Si
          un valor quedó mal, cargalo de nuevo para el mismo mes y se corrige.
        </p>
      </div>
      <Suspense fallback={<CardSkeleton label="Cargando índices…" lines={4} />}>
        <Indices />
      </Suspense>
    </div>
  );
}

async function Indices() {
  await requireUser();
  const org = await getCurrentOrg();
  if (!org) redirect("/proyectos");
  const isOwner = org.role === "owner";

  const supabase = await createClient();
  const [{ data }, { data: stageData }] = await Promise.all([
    supabase
      .from("price_indices")
      .select("id, name, period, value")
      .order("name")
      .order("period", { ascending: false }),
    isOwner
      ? supabase.from("fee_stages").select("index_name, index_base_period").not("index_name", "is", null)
      : Promise.resolve({ data: [] as { index_name: string; index_base_period: string }[] }),
  ]);
  const rows = (data ?? []) as IndexRow[];

  // Cuántas etapas usan cada valor como mes base (para avisar antes de borrarlo).
  const baseStages = new Map<string, number>();
  for (const s of stageData ?? []) {
    const key = `${s.index_name}|${s.index_base_period}`;
    baseStages.set(key, (baseStages.get(key) ?? 0) + 1);
  }

  const byName = new Map<string, IndexRow[]>();
  for (const r of rows) byName.set(r.name, [...(byName.get(r.name) ?? []), r]);
  const names = [...byName.keys()];

  return (
    <>
      {isOwner ? (
        <section className="card">
          <h2 className="mb-4 font-medium">Cargar un valor</h2>
          <IndexValueForm names={names} />
        </section>
      ) : (
        <p className="text-sm text-muted">Los valores los carga el dueño del estudio.</p>
      )}

      {names.length === 0 ? (
        <p className="text-sm text-muted">Todavía no hay índices cargados.</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {names.map((name) => {
            const list = byName.get(name)!;
            return (
              <section key={name} className="card">
                <div className="mb-3 flex items-baseline gap-3">
                  <h2 className="font-medium">{name}</h2>
                  <span className="ml-auto text-xs text-muted">Último: {formatPeriod(list[0].period)}</span>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-muted">
                      <th className="py-2 pr-4 font-medium">Mes</th>
                      <th className="py-2 pr-4 text-right font-medium">Valor</th>
                      <th className="py-2 pr-4 text-right font-medium">Variación</th>
                      {isOwner && <th className="py-2"><span className="sr-only">Acciones</span></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((r, i) => {
                      const prev = list[i + 1];
                      const change = prev ? (Number(r.value) / Number(prev.value) - 1) * 100 : null;
                      return (
                        <tr key={r.id} className="border-b border-line last:border-0">
                          <td className="py-2 pr-4 capitalize">{formatPeriod(r.period)}</td>
                          <td className="py-2 pr-4 text-right font-mono">{formatIndexValue(r.value)}</td>
                          <td className="py-2 pr-4 text-right font-mono text-muted">
                            {change === null ? "—" : `${pctFormatter.format(change)}%`}
                          </td>
                          {isOwner && (
                            <td className="py-1 text-right">
                              <DeleteIndexValueForm
                                id={r.id}
                                label={`${name} de ${formatPeriod(r.period)}`}
                                baseStages={baseStages.get(`${name}|${r.period}`) ?? 0}
                              />
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
