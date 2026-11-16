import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { PageSkeleton } from "@/components/skeleton";
import { StatusPill, type PillTone } from "@/components/status-pill";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/format";
import { BUDGET_LEVEL_LABEL, BUDGET_STATUS_LABEL, idSchema, type BudgetLevel, type BudgetStatus } from "@/lib/validation";
import { loadWorksProject } from "../../project-header";

export const metadata: Metadata = { title: "Comparar presupuestos" };

type Version = { id: string; number: number; level: BudgetLevel; status: BudgetStatus; currency: string };
type Totals = { budget_id: string; total: string; cost: string; markup_amount: string; fees_amount: string; price: string };
type Row = {
  chapter: string;
  item_key: string;
  description: string;
  unit: string;
  quantity_a: string | null;
  quantity_b: string | null;
  unit_price_a: string | null;
  unit_price_b: string | null;
  total_a: string | null;
  total_b: string | null;
  change: "added" | "removed" | "changed" | "same";
};

const CHANGE: Record<Row["change"], { label: string; tone: PillTone }> = {
  added: { label: "Nuevo", tone: "info" },
  removed: { label: "Eliminado", tone: "danger" },
  changed: { label: "Cambió", tone: "warn" },
  same: { label: "Igual", tone: "neutral" },
};

const qty = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 4 });

export default function ComparePage({ params, searchParams }: PageProps<"/proyectos/[id]/presupuestos/comparar">) {
  return (
    <Suspense fallback={<PageSkeleton label="Comparando…" title={false} cards={2} list={false} />}>
      <Compare params={params} searchParams={searchParams} />
    </Suspense>
  );
}

// Dos versiones por rubro e ítem: qué se agregó, qué se sacó y qué cambió, para explicárselo al
// cliente. Los ítems se emparejan por el código del análisis o por la descripción.
async function Compare({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const { project } = await loadWorksProject(id);
  const supabase = await createClient();
  const { data: versionData } = await supabase
    .from("budgets")
    .select("id, number, level, status, currency")
    .eq("project_id", id)
    .neq("level", "parametric")
    .order("number", { ascending: false });
  const versions = (versionData ?? []) as Version[];
  const pick = (v: unknown) => (typeof v === "string" && idSchema.safeParse(v).success && versions.some((x) => x.id === v) ? v : null);
  // Por defecto, la última contra la anterior.
  const b = pick(query.b) ?? versions[0]?.id ?? null;
  const a = pick(query.a) ?? versions.find((v) => v.id !== b)?.id ?? null;
  const va = versions.find((v) => v.id === a);
  const vb = versions.find((v) => v.id === b);

  let rows: Row[] = [];
  let totals = new Map<string, Totals>();
  if (va && vb && va.id !== vb.id) {
    const [{ data: rowData }, { data: totalData }] = await Promise.all([
      supabase.rpc("compare_budgets", { p_a: va.id, p_b: vb.id }),
      supabase.from("budget_totals").select("budget_id, total, cost, markup_amount, fees_amount, price").in("budget_id", [va.id, vb.id]),
    ]);
    rows = (rowData ?? []) as Row[];
    totals = new Map(((totalData ?? []) as Totals[]).map((t) => [t.budget_id, t]));
  }
  const changed = rows.filter((r) => r.change !== "same");
  const same = rows.length - changed.length;
  const chapters = [...new Set(changed.map((r) => r.chapter))];
  const label = (v: Version) => `V${v.number} · ${BUDGET_LEVEL_LABEL[v.level]} · ${BUDGET_STATUS_LABEL[v.status]}`;

  return (
    <>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <Link href={`/proyectos/${project.id}/presupuestos`} className="text-sm text-muted hover:underline">
          Presupuestos
        </Link>
        <span className="text-sm text-muted">/</span>
        <h2 className="text-lg font-semibold">Comparar versiones</h2>
      </div>

      <section className="card">
        {versions.length < 2 ? (
          <p className="text-sm text-muted">Hacen falta al menos dos presupuestos por rubros o por ítem para comparar.</p>
        ) : (
          <form className="flex flex-wrap items-end gap-3">
            <label className="field">
              Antes
              <select name="a" defaultValue={a ?? ""} className="input">
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {label(v)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Después
              <select name="b" defaultValue={b ?? ""} className="input">
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {label(v)}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="btn btn-secondary">
              Comparar
            </button>
          </form>
        )}
      </section>

      {va && vb && va.id === vb.id && <p className="text-sm text-muted">Elegí dos versiones distintas.</p>}

      {va && vb && va.id !== vb.id && (
        <>
          <section className="card flex flex-col gap-3" aria-label="Totales de las dos versiones">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-muted">
                    <th className="py-2 pr-4 font-medium"><span className="sr-only">Concepto</span></th>
                    <th className="py-2 pr-4 text-right font-medium">V{va.number}</th>
                    <th className="py-2 pr-4 text-right font-medium">V{vb.number}</th>
                    <th className="py-2 text-right font-medium">Diferencia</th>
                  </tr>
                </thead>
                <tbody>
                  {(
                    [
                      ["Costo directo", "total"],
                      ["Costo con personal e indirectos", "cost"],
                      ["Pase", "markup_amount"],
                      ["Honorarios", "fees_amount"],
                      ["Precio sin IVA", "price"],
                    ] as const
                  ).map(([name, key]) => {
                    const x = Number(totals.get(va.id)?.[key] ?? 0);
                    const y = Number(totals.get(vb.id)?.[key] ?? 0);
                    return (
                      <tr key={key} className={key === "price" ? "border-t border-line font-semibold" : ""}>
                        <th scope="row" className="py-1.5 pr-4 text-left font-normal">
                          {name}
                        </th>
                        <td className="py-1.5 pr-4 text-right font-mono whitespace-nowrap">{formatMoney(x, va.currency)}</td>
                        <td className="py-1.5 pr-4 text-right font-mono whitespace-nowrap">{formatMoney(y, vb.currency)}</td>
                        <td className={`py-1.5 text-right font-mono whitespace-nowrap ${y - x > 0 ? "text-warn" : y - x < 0 ? "text-ok" : "text-muted"}`}>
                          {va.currency === vb.currency ? `${y - x > 0 ? "+" : ""}${formatMoney(Math.round((y - x) * 100) / 100, vb.currency)}` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {va.currency !== vb.currency && (
              <p className="text-sm text-warn">Las versiones están en monedas distintas: no se restan.</p>
            )}
          </section>

          <section className="card flex flex-col gap-4" aria-labelledby="cambios">
            <h2 id="cambios" className="font-bold">
              {changed.length === 0 ? "Sin cambios en los ítems" : `${changed.length} ${changed.length === 1 ? "cambio" : "cambios"} en los ítems`}
              {same > 0 && <span className="font-normal text-muted"> · {same} iguales</span>}
            </h2>
            {chapters.map((chapter) => (
              <div key={chapter} className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold text-subtle">{chapter}</h3>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-line text-left text-muted">
                        <th className="py-2 pr-4 font-medium">Ítem</th>
                        <th className="py-2 pr-4 text-right font-medium">Cantidad</th>
                        <th className="py-2 pr-4 text-right font-medium">Precio unitario</th>
                        <th className="py-2 pr-4 text-right font-medium">Total</th>
                        <th className="py-2 font-medium"><span className="sr-only">Cambio</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {changed
                        .filter((r) => r.chapter === chapter)
                        .map((r) => (
                          <tr key={`${r.item_key}-${r.description}-${r.change}`} className="border-b border-line align-top last:border-0">
                            <td className="py-2 pr-4">
                              <span className="font-medium">{r.description}</span>
                              <span className="block text-xs text-muted">{r.unit}</span>
                            </td>
                            <td className="py-2 pr-4 text-right font-mono whitespace-nowrap">
                              <Before value={r.quantity_a === null ? null : qty.format(Number(r.quantity_a))} />
                              {r.quantity_b === null ? "—" : qty.format(Number(r.quantity_b))}
                            </td>
                            <td className="py-2 pr-4 text-right font-mono whitespace-nowrap">
                              <Before value={r.unit_price_a === null ? null : formatMoney(r.unit_price_a, va.currency)} />
                              {formatMoney(r.unit_price_b, vb.currency)}
                            </td>
                            <td className="py-2 pr-4 text-right font-mono whitespace-nowrap">
                              <Before value={r.total_a === null ? null : formatMoney(r.total_a, va.currency)} />
                              {formatMoney(r.total_b, vb.currency)}
                            </td>
                            <td className="py-2 text-right">
                              <StatusPill tone={CHANGE[r.change].tone}>{CHANGE[r.change].label}</StatusPill>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </section>
        </>
      )}
    </>
  );
}

// El valor de la versión anterior, chico y tachado arriba del nuevo.
function Before({ value }: { value: string | null }) {
  if (value === null) return null;
  return <span className="block text-xs text-muted line-through">{value}</span>;
}
