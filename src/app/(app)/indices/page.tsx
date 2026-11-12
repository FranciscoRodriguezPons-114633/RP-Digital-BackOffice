import { Suspense } from "react";
import { CardSkeleton } from "@/components/skeleton";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrg, requireUser } from "@/lib/dal";
import { StatusPill } from "@/components/status-pill";
import { formatDate, formatIndexValue, formatPeriod, todayInCordoba } from "@/lib/format";
import { EXCHANGE_SOURCE_LABEL, type ExchangeSource } from "@/lib/validation";
import { DeleteIndexValueForm, IndexValueForm } from "../co-forms";
import { AdoptSeriesForm, DeleteExchangeRateForm, ExchangeRateForm } from "../series-forms";

export const metadata: Metadata = { title: "Índices" };

type IndexRow = {
  id: string;
  name: string;
  period: string;
  value: string;
  previous_value: string | null;
  provisional: boolean;
  months: number;
};
type SeriesRow = {
  code: string;
  name: string;
  unit: string;
  last_period: string | null;
  last_value: string | null;
  last_provisional: boolean;
};
type Adopted = { series_code: string; local_name: string };
type RateRow = { id: string; rate_date: string; source: ExchangeSource; rate: string };

// Meses que se muestran de cada índice. La variación sale de la base (previous_value), así que
// no hace falta traer un mes más.
const MONTHS_SHOWN = 24;

const rateFormatter = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 4 });

const pctFormatter = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2, signDisplay: "always" });

export default function IndicesPage() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">Índices</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Los índices con los que se actualizan los honorarios. Adoptá una serie de referencia (CAC, ICC Córdoba,
          UOCRA) y sus valores te llegan solos, o cargá a mano el valor de cada mes de un índice propio. Cada etapa
          vinculada se actualiza con el último valor dividido el de su mes base.
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
  const [{ data }, { data: stageData }, { data: seriesData }, { data: adoptedData }, { data: rateData }] =
    await Promise.all([
      supabase
        .from("price_index_history")
        .select("id, name, period, value, previous_value, provisional, months")
        .eq("org_id", org.id)
        .lte("recency", MONTHS_SHOWN)
        .order("name")
        .order("period", { ascending: false }),
      isOwner
        ? supabase.from("fee_stages").select("index_name, index_base_period").not("index_name", "is", null)
        : Promise.resolve({ data: [] as { index_name: string; index_base_period: string }[] }),
      supabase
        .from("reference_series_summary")
        .select("code, name, unit, last_period, last_value, last_provisional")
        .order("position"),
      supabase.from("org_reference_series").select("series_code, local_name").eq("org_id", org.id),
      supabase
        .from("exchange_rates")
        .select("id, rate_date, source, rate")
        .eq("org_id", org.id)
        .order("rate_date", { ascending: false })
        .order("source")
        .limit(12),
    ]);
  const rows = (data ?? []) as IndexRow[];
  const series = (seriesData ?? []) as SeriesRow[];
  const adopted = new Map(((adoptedData ?? []) as Adopted[]).map((a) => [a.series_code, a.local_name]));
  const adoptedNames = new Set(adopted.values());
  const rates = (rateData ?? []) as RateRow[];

  // Cuántas etapas usan cada valor como mes base (para avisar antes de borrarlo).
  const baseStages = new Map<string, number>();
  for (const s of stageData ?? []) {
    const key = `${s.index_name}|${s.index_base_period}`;
    baseStages.set(key, (baseStages.get(key) ?? 0) + 1);
  }

  const byName = new Map<string, IndexRow[]>();
  for (const r of rows) {
    const list = byName.get(r.name);
    if (list) list.push(r);
    else byName.set(r.name, [r]);
  }
  const names = [...byName.keys()];
  const manualNames = names.filter((n) => !adoptedNames.has(n));
  const toAdopt = series.filter((x) => !adopted.has(x.code));

  return (
    <>
      {isOwner ? (
        <section className="card">
          <h2 className="mb-4 font-medium">Cargar un valor</h2>
          <IndexValueForm names={manualNames} />
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
                <div className="mb-3 flex flex-wrap items-baseline gap-3">
                  <h2 className="font-medium">{name}</h2>
                  {adoptedNames.has(name) && <StatusPill tone="info">Serie de referencia</StatusPill>}
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
                    {list.map((r) => {
                      const change =
                        r.previous_value === null ? null : (Number(r.value) / Number(r.previous_value) - 1) * 100;
                      return (
                        <tr key={r.id} className="border-b border-line last:border-0">
                          <td className="py-2 pr-4 capitalize">
                            {formatPeriod(r.period)}
                            {r.provisional && <span className="ml-2 text-xs normal-case text-warn">provisorio</span>}
                          </td>
                          <td className="py-2 pr-4 text-right font-mono">{formatIndexValue(r.value)}</td>
                          <td className="py-2 pr-4 text-right font-mono text-muted">
                            {change === null ? "—" : `${pctFormatter.format(change)}%`}
                          </td>
                          {isOwner && (
                            <td className="py-1 text-right">
                              {!adoptedNames.has(name) && <DeleteIndexValueForm
                                id={r.id}
                                label={`${name} de ${formatPeriod(r.period)}`}
                                baseStages={baseStages.get(`${name}|${r.period}`) ?? 0}
                              />}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {list[0].months > list.length && (
                  <p className="mt-3 text-xs text-muted">
                    Se muestran los últimos {list.length} de {list[0].months} meses.
                  </p>
                )}
              </section>
            );
          })}
        </div>
      )}

      <section className="card flex flex-col gap-4">
        <div>
          <h2 className="font-medium">Series de referencia</h2>
          <p className="mt-1 text-sm text-muted">
            Las carga la plataforma desde la fuente oficial. Al adoptar una, el historial se copia a tus índices y
            cada valor nuevo o corregido te llega solo; los provisorios se marcan hasta que se publica el definitivo.
          </p>
        </div>
        <ul className="flex flex-col divide-y divide-line text-sm">
          {series.map((x) => {
            const localName = adopted.get(x.code);
            return (
              <li key={x.code} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2 first:pt-0 last:pb-0">
                <span className="font-medium">{x.name}</span>
                <span className="text-xs text-muted">{x.unit}</span>
                {localName && (
                  <StatusPill tone="ok">{localName === x.name ? "Adoptada" : `Adoptada como ${localName}`}</StatusPill>
                )}
                <span className="ml-auto font-mono text-muted">
                  {x.last_value !== null
                    ? `${formatIndexValue(x.last_value)} · ${formatPeriod(x.last_period)}`
                    : "Sin valores todavía"}
                  {x.last_provisional && " (provisorio)"}
                </span>
              </li>
            );
          })}
        </ul>
        {isOwner && toAdopt.length > 0 && (
          <div className="border-t border-line pt-4">
            <h3 className="mb-3 text-sm font-medium">Adoptar una serie</h3>
            <AdoptSeriesForm
              series={toAdopt.map(({ code, name, unit }) => ({ code, name, unit }))}
              manualNames={manualNames}
            />
          </div>
        )}
      </section>

      <section className="card flex flex-col gap-4">
        <div>
          <h2 className="font-medium">Tipo de cambio</h2>
          <p className="mt-1 text-sm text-muted">
            Cuántos pesos vale un dólar en cada fecha, según la fuente. Para pasar un monto de una moneda a otra se usa
            la última cotización anterior o igual a su fecha.
          </p>
        </div>
        {isOwner && <ExchangeRateForm today={todayInCordoba()} />}
        {rates.length === 0 ? (
          <p className="text-sm text-muted">Todavía no hay cotizaciones cargadas.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-muted">
                <th className="py-2 pr-4 font-medium">Fecha</th>
                <th className="py-2 pr-4 font-medium">Fuente</th>
                <th className="py-2 pr-4 text-right font-medium">ARS por USD</th>
                {isOwner && <th className="py-2"><span className="sr-only">Acciones</span></th>}
              </tr>
            </thead>
            <tbody>
              {rates.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-0">
                  <td className="py-2 pr-4">{formatDate(r.rate_date)}</td>
                  <td className="py-2 pr-4">{EXCHANGE_SOURCE_LABEL[r.source]}</td>
                  <td className="py-2 pr-4 text-right font-mono">{rateFormatter.format(Number(r.rate))}</td>
                  {isOwner && (
                    <td className="py-1 text-right">
                      <DeleteExchangeRateForm
                        id={r.id}
                        label={`${EXCHANGE_SOURCE_LABEL[r.source]} del ${formatDate(r.rate_date)}`}
                      />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
