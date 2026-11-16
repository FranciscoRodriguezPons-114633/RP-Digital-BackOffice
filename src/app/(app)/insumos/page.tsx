import { Suspense } from "react";
import Link from "next/link";
import { PillNav } from "@/components/ui/pill-nav";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { ListSkeleton } from "@/components/skeleton";
import { StatusPill } from "@/components/status-pill";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrg, hasWorks, requireUser } from "@/lib/dal";
import { formatDate, formatIndexValue, formatUnitPrice, todayInCordoba } from "@/lib/format";
import { SUPPLY_KINDS, SUPPLY_KIND_LABEL, type SupplyKind } from "@/lib/supplies";
import { LaborSettingForm, SupplyForm } from "../supply-forms";
import { loadSupplyFormData } from "./data";
import { RevealText } from "@/components/motion/reveal-title";
import { PanelButton } from "@/components/ui/panel-button";
import { Plus } from "lucide-react";

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
  price: string | null;
  price_date: string | null;
  reference_series_code: string | null;
  active: boolean;
  parties: { name: string } | null;
};

export default function SuppliesPage({ searchParams }: PageProps<"/insumos">) {
  return (
    <div className="reveal-group flex flex-col gap-8">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 grow basis-72">
          <h1 className="page-title"><RevealText text="Insumos" /></h1>
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
  const unpricedOnly = query.sin_precio === "1";

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
  if (unpricedOnly) list = list.is("price", null);

  const [{ data, count }, form, { count: unpriced }] = await Promise.all([
    list,
    loadSupplyFormData(org.id),
    supabase.from("supplies").select("id", { count: "exact", head: true }).eq("org_id", org.id).is("price", null),
  ]);
  const rows = (data ?? []) as unknown as Row[];
  const total = count ?? rows.length;
  const filtered = !!q || !!kind || unpricedOnly;
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
        <PanelButton label="Nuevo insumo" title="Nuevo insumo" eyebrow="Insumos" variant="primary" icon={<Plus aria-hidden="true" size={16} />} className="self-start">
          <SupplyForm suppliers={form.suppliers} laborSeries={form.laborSeries} chargesPct={form.chargesPct} today={today} />
        </PanelButton>

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
        <PillNav
          label="Tipo de insumo"
          items={[undefined, ...SUPPLY_KINDS].map((k) => ({
            href: href(k),
            label: k ? SUPPLY_KIND_LABEL[k] : "Todos",
            current: kind === k,
          }))}
        />

        {(unpriced ?? 0) > 0 && (
          <p className="rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">
            {unpriced === 1 ? "Hay un insumo sin precio" : `Hay ${unpriced} insumos sin precio`}: los análisis que los
            usan no los suman.{" "}
            {unpricedOnly ? (
              <Link href="/insumos" className="underline">
                Ver todos
              </Link>
            ) : (
              <Link href="/insumos?sin_precio=1" className="underline">
                Ver cuáles
              </Link>
            )}
          </p>
        )}

        {rows.length === 0 ? (
          <p className="text-sm text-muted">
            {filtered ? "No hay insumos que coincidan con la búsqueda." : "Todavía no hay insumos. Cargá el primero o importá una lista desde Excel."}
          </p>
        ) : (
          <>
            {/* Teléfono: una fila por insumo, con nombre, código y precio. */}
            <ul className="flex flex-col divide-y divide-line sm:hidden">
              {rows.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/insumos/${s.id}`}
                    className={`flex items-baseline gap-3 py-3 outline-none focus-visible:ring-3 focus-visible:ring-focus ${s.active ? "" : "text-muted"}`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{s.name}</span>
                      <span className="block text-xs text-muted">
                        <span className="font-mono">{s.code}</span> · {s.unit}
                        {s.price_date && ` · ${formatDate(s.price_date)}`}
                        {!s.active && " · inactivo"}
                      </span>
                    </span>
                    <span className="font-mono text-sm whitespace-nowrap">
                      {s.price === null ? <span className="font-sans text-warn">Sin precio</span> : formatUnitPrice(s.price, s.currency)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            {/* Computadora: tabla */}
            <div className="hidden overflow-x-auto sm:block">
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
                      <td className="py-2 pr-4 text-right font-mono whitespace-nowrap">
                        {s.price === null ? <span className="font-sans text-warn">Sin precio</span> : formatUnitPrice(s.price, s.currency)}
                      </td>
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
          <h2 className="font-bold">Cargas sobre la mano de obra</h2>
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
