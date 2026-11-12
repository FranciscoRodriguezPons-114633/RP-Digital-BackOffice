import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { Disclosure } from "@/components/disclosure";
import { ListSkeleton } from "@/components/skeleton";
import { StatusPill } from "@/components/status-pill";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrg, hasWorks, requireUser } from "@/lib/dal";
import { formatDate, formatIndexValue, formatUnitPrice, todayInCordoba } from "@/lib/format";
import { SUPPLY_KINDS, SUPPLY_KIND_LABEL, type SupplyKind } from "@/lib/supplies";
import { LaborSettingForm, SupplyForm } from "../supply-forms";
import { loadSupplyFormData } from "./data";

export const metadata: Metadata = { title: "Insumos" };

// Filas por pantalla: con más, se afina con la búsqueda o el tipo.
const PAGE_SIZE = 200;

type Row = {
  id: string;
  kind: SupplyKind;
  code: string;
  name: string;
  unit: string;
  currency: string;
  price: string;
  price_date: string;
  reference_series_code: string | null;
  active: boolean;
  parties: { name: string } | null;
};

export default function SuppliesPage({ searchParams }: PageProps<"/insumos">) {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold">Insumos</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Materiales, mano de obra, equipos y personal, con su precio y la fecha de ese precio. Con esto se
            valorizan los análisis de precios y los presupuestos.
          </p>
        </div>
        <Link href="/insumos/importar" className="btn btn-secondary">
          Importar desde Excel
        </Link>
      </div>
      <Suspense fallback={<ListSkeleton label="Cargando insumos…" rows={6} />}>
        <Supplies searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Supplies({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  await requireUser();
  const org = await getCurrentOrg();
  if (!org) redirect("/proyectos");
  if (!hasWorks(org)) notFound();

  // La búsqueda va dentro de un filtro `or`: se sacan los caracteres que lo romperían.
  const q = (typeof query.q === "string" ? query.q : "").replace(/[,()%*\\"]/g, " ").trim().slice(0, 60);
  const kind = SUPPLY_KINDS.find((k) => k === query.tipo);

  const supabase = await createClient();
  let list = supabase
    .from("supplies")
    .select("id, kind, code, name, unit, currency, price, price_date, reference_series_code, active, parties(name)", {
      count: "exact",
    })
    .eq("org_id", org.id)
    .order("code")
    .limit(PAGE_SIZE);
  if (kind) list = list.eq("kind", kind);
  if (q) list = list.or(`code.ilike.%${q}%,name.ilike.%${q}%`);

  const [{ data, count }, form] = await Promise.all([list, loadSupplyFormData(org.id)]);
  const rows = (data ?? []) as unknown as Row[];
  const total = count ?? rows.length;
  const filtered = !!q || !!kind;
  const today = todayInCordoba();
  const href = (k?: SupplyKind) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (k) params.set("tipo", k);
    const s = params.toString();
    return s ? `/insumos?${s}` : "/insumos";
  };

  return (
    <>
      <section className="card flex flex-col gap-4">
        <Disclosure
          defaultOpen={total === 0 && !filtered}
          className="rounded-md border border-dashed border-line"
          summary="Nuevo insumo"
          summaryClassName="cursor-pointer px-4 py-3 text-sm font-medium"
        >
          <div className="border-t border-line p-4">
            <SupplyForm suppliers={form.suppliers} laborSeries={form.laborSeries} chargesPct={form.chargesPct} today={today} />
          </div>
        </Disclosure>

        <form action="/insumos" className="flex flex-wrap items-end gap-3">
          <label className="field min-w-0 flex-1">
            Buscar por código o nombre
            <input name="q" type="search" defaultValue={q} maxLength={60} placeholder="cemento, MAT-001…" className="input" />
          </label>
          {kind && <input type="hidden" name="tipo" value={kind} />}
          <button type="submit" className="btn btn-secondary">
            Buscar
          </button>
        </form>
        <nav aria-label="Tipo de insumo" className="flex gap-1 overflow-x-auto border-b border-line">
          {[undefined, ...SUPPLY_KINDS].map((k) => (
            <Link
              key={k ?? "all"}
              href={href(k)}
              aria-current={kind === k ? "true" : undefined}
              className={`-mb-px border-b-2 px-3 py-2 text-sm whitespace-nowrap outline-none focus-visible:ring-3 focus-visible:ring-focus ${
                kind === k ? "border-accent font-medium text-foreground" : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              {k ? SUPPLY_KIND_LABEL[k] : "Todos"}
            </Link>
          ))}
        </nav>

        {rows.length === 0 ? (
          <p className="text-sm text-muted">
            {filtered ? "No hay insumos que coincidan con la búsqueda." : "Todavía no hay insumos. Cargá el primero o importá una lista desde Excel."}
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-muted">
                    <th className="py-2 pr-4 font-medium">Código</th>
                    <th className="py-2 pr-4 font-medium">Nombre</th>
                    <th className="py-2 pr-4 font-medium">Unidad</th>
                    <th className="py-2 pr-4 text-right font-medium">Precio</th>
                    <th className="py-2 font-medium">Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s) => (
                    <tr key={s.id} className={`border-b border-line align-top last:border-0 ${s.active ? "" : "text-muted"}`}>
                      <td className="py-2 pr-4 font-mono whitespace-nowrap">
                        <Link href={`/insumos/${s.id}`} className="hover:underline">
                          {s.code}
                        </Link>
                      </td>
                      <td className="py-2 pr-4">
                        <Link href={`/insumos/${s.id}`} className="font-medium hover:underline">
                          {s.name}
                        </Link>
                        <span className="block text-xs text-muted">
                          {[SUPPLY_KIND_LABEL[s.kind], s.parties?.name].filter(Boolean).join(" · ")}
                          {s.reference_series_code && " · precio de la escala salarial"}
                          {!s.active && " · inactivo"}
                        </span>
                      </td>
                      <td className="py-2 pr-4">{s.unit}</td>
                      <td className="py-2 pr-4 text-right font-mono whitespace-nowrap">{formatUnitPrice(s.price, s.currency)}</td>
                      <td className="py-2 whitespace-nowrap text-muted">{formatDate(s.price_date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted">
              {total > rows.length
                ? `Se muestran ${rows.length} de ${total} insumos: afiná la búsqueda para ver el resto.`
                : `${total} ${total === 1 ? "insumo" : "insumos"}`}
            </p>
          </>
        )}
      </section>

      <section className="card flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 className="font-medium">Cargas sobre la mano de obra</h2>
          {form.chargesPct === null ? (
            <StatusPill tone="warn">Sin cargar</StatusPill>
          ) : (
            <span className="ml-auto font-mono text-sm">
              {formatIndexValue(form.chargesPct)} % desde el {formatDate(form.chargesFrom)}
            </span>
          )}
        </div>
        <p className="text-sm text-muted">
          La mano de obra que toma el precio de la escala UOCRA vale: valor hora de la escala × (1 + este porcentaje de
          cargas sociales y Fondo de Cese). Cuando la plataforma carga una paritaria nueva, el precio cambia solo y el
          anterior queda en el historial. El porcentaje lo define cada empresa con su contador.
        </p>
        {org.role === "owner" ? (
          <LaborSettingForm chargesPct={form.chargesPct} today={today} />
        ) : (
          <p className="text-sm text-muted">El porcentaje lo carga el dueño.</p>
        )}
      </section>
    </>
  );
}
