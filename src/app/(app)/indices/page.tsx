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
  reference_series_code: string | null;
  provisional: boolean;
};
type SeriesRow = { code: string; name: string; unit: string; publisher: string };
type RefValue = { series_code: string; period: string; value: string; provisional: boolean };
type Adopted = { series_code: string; local_name: string };
type RateRow = { id: string; rate_date: string; source: ExchangeSource; rate: string };

const rateFormatter = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 4 });

function requestTime() {
  return new Date();
}

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
  const [{ data }, { data: stageData }, { data: seriesData }, { data: refData }, { data: adoptedData }, { data: rateData }] =
    await Promise.all([
      supabase
        .from("price_indices")
        .select("id, name, period, value, reference_series_code, provisional")
        .order("name")
        .order("period", { ascending: false }),
      isOwner
        ? supabase.from("fee_stages").select("index_name, index_base_period").not("index_name", "is", null)
        : Promise.resolve({ data: [] as { index_name: string; index_base_period: string }[] }),
      supabase.from("reference_series").select("code, name, unit, publisher").order("position"),
      supabase
        .from("reference_values")
        .select("series_code, period, value, provisional")
        .order("period", { ascending: false })
        .limit(2000),
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
  const lastValue = new Map<string, RefValue>();
  for (const v of (refData ?? []) as RefValue[]) if (!lastValue.has(v.series_code)) lastValue.set(v.series_code, v);

  // Cuántas etapas usan cada valor como mes base (para avisar antes de borrarlo).
  const baseStages = new Map<string, number>();
  for (const s of stageData ?? []) {
    const key = `${s.index_name}|${s.index_base_period}`;
    baseStages.set(key, (baseStages.get(key) ?? 0) + 1);
  }

  const byName = new Map<string, IndexRow[]>();
  for (const r of rows) byName.set(r.name, [...(byName.get(r.name) ?? []), r]);
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
            const last = lastValue.get(x.code);
            const localName = adopted.get(x.code);
            return (
              <li key={x.code} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2 first:pt-0 last:pb-0">
                <span className="font-medium">{x.name}</span>
                <span className="text-xs text-muted">{x.unit}</span>
                {localName && (
                  <StatusPill tone="ok">{localName === x.name ? "Adoptada" : `Adoptada como ${localName}`}</StatusPill>
                )}
                <span className="ml-auto font-mono text-muted">
                  {last ? `${formatIndexValue(last.value)} · ${formatPeriod(last.period)}` : "Sin valores todavía"}
                  {last?.provisional && " (provisorio)"}
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
        {isOwner && <ExchangeRateForm today={todayInCordoba(requestTime())} />}
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
                    {list.map((r, i) => {
                      const prev = list[i + 1];
                      const change = prev ? (Number(r.value) / Number(prev.value) - 1) * 100 : null;
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
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
