import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { CardSkeleton } from "@/components/skeleton";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrg, hasWorks, requireUser } from "@/lib/dal";
import { formatDate, formatUnitPrice, todayInCordoba } from "@/lib/format";
import { SUPPLY_KIND_LABEL } from "@/lib/supplies";
import { idSchema } from "@/lib/validation";
import { SupplyForm, type SupplyValues } from "../../supply-forms";
import { loadSupplyFormData } from "../data";

export const metadata: Metadata = { title: "Insumo" };

type PriceRow = { id: number; price: string; currency: string; price_date: string; source: "manual" | "import" | "series"; created_at: string };

const SOURCE_LABEL = { manual: "Cargado a mano", import: "Importado de Excel", series: "Escala salarial" } as const;
const HISTORY_SHOWN = 24;
const dateTimeFmt = new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeZone: "America/Argentina/Cordoba" });

export default function SupplyPage({ params }: PageProps<"/insumos/[id]">) {
  return (
    <div className="flex flex-col gap-8">
      <Link href="/insumos" className="text-sm text-muted hover:underline">← Insumos</Link>
      <Suspense fallback={<CardSkeleton label="Cargando insumo…" lines={6} />}>
        <Supply params={params} />
      </Suspense>
    </div>
  );
}

async function Supply({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();
  await requireUser();
  const org = await getCurrentOrg();
  if (!org || !hasWorks(org)) notFound();

  const supabase = await createClient();
  const [{ data: supply }, { data: priceData, count }, form] = await Promise.all([
    supabase
      .from("supplies")
      .select("id, kind, code, name, unit, currency, price, price_date, supplier_party_id, reference_series_code, active")
      .eq("id", id)
      .eq("org_id", org.id)
      .maybeSingle<SupplyValues>(),
    supabase
      .from("supply_prices")
      .select("id, price, currency, price_date, source, created_at", { count: "exact" })
      .eq("supply_id", id)
      .order("id", { ascending: false })
      .limit(HISTORY_SHOWN),
    loadSupplyFormData(org.id),
  ]);
  if (!supply) notFound();
  const prices = (priceData ?? []) as PriceRow[];

  return (
    <>
      <header>
        <h1 className="text-2xl font-semibold">{supply.name}</h1>
        <p className="mt-1 text-sm text-muted">
          <span className="font-mono">{supply.code}</span> · {SUPPLY_KIND_LABEL[supply.kind]} ·{" "}
          {supply.price === null ? (
            <span className="text-warn">sin precio</span>
          ) : (
            <>
              <span className="font-mono">{formatUnitPrice(supply.price, supply.currency)}</span> por {supply.unit}
            </>
          )}
          {!supply.active && " · inactivo"}
        </p>
      </header>

      <section className="card flex flex-col gap-4">
        <h2 className="font-medium">Editar</h2>
        <SupplyForm
          supply={supply}
          suppliers={form.suppliers}
          laborSeries={form.laborSeries}
          chargesPct={form.chargesPct}
          today={todayInCordoba()}
        />
      </section>

      <section className="card flex flex-col gap-4">
        <div>
          <h2 className="font-medium">Historial de precios</h2>
          <p className="mt-1 text-sm text-muted">Cada precio que tuvo el insumo. No se borra ni se edita.</p>
        </div>
        {prices.length === 0 && <p className="text-sm text-muted">Todavía no tiene precio: cargalo arriba.</p>}
        <table className={`w-full text-sm ${prices.length === 0 ? "hidden" : ""}`}>
          <thead>
            <tr className="border-b border-line text-left text-muted">
              <th className="py-2 pr-4 font-medium">Fecha del precio</th>
              <th className="py-2 pr-4 text-right font-medium">Precio</th>
              <th className="py-2 pr-4 text-right font-medium">Variación</th>
              <th className="py-2 font-medium">Origen</th>
            </tr>
          </thead>
          <tbody>
            {prices.map((p, i) => {
              const prev = prices[i + 1];
              const change =
                prev && prev.currency === p.currency ? (Number(p.price) / Number(prev.price) - 1) * 100 : null;
              return (
                <tr key={p.id} className="border-b border-line last:border-0">
                  <td className="py-2 pr-4">{formatDate(p.price_date)}</td>
                  <td className="py-2 pr-4 text-right font-mono whitespace-nowrap">{formatUnitPrice(p.price, p.currency)}</td>
                  <td className="py-2 pr-4 text-right font-mono text-muted">
                    {change === null ? "—" : `${change > 0 ? "+" : ""}${change.toFixed(1).replace(".", ",")}%`}
                  </td>
                  <td className="py-2 text-muted">
                    {SOURCE_LABEL[p.source]} · {dateTimeFmt.format(new Date(p.created_at))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {(count ?? 0) > prices.length && (
          <p className="text-xs text-muted">
            Se muestran los últimos {prices.length} de {count} precios.
          </p>
        )}
      </section>
    </>
  );
}
