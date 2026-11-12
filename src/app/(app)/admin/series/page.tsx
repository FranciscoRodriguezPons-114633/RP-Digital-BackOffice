import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { CardSkeleton } from "@/components/skeleton";
import { StatusPill } from "@/components/status-pill";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/dal";
import { formatIndexValue, formatPeriod } from "@/lib/format";
import { SeriesPasteForm } from "../../series-forms";

export const metadata: Metadata = { title: "Series de referencia" };

type Series = {
  code: string;
  name: string;
  unit: string;
  publisher: string;
  source_url: string | null;
  note: string | null;
  months: number;
  provisional_months: number;
  last_period: string | null;
  last_value: string | null;
};
type Revision = {
  id: number;
  series_code: string;
  period: string;
  old_value: string;
  new_value: string;
  old_provisional: boolean;
  new_provisional: boolean;
  note: string | null;
  actor_email: string | null;
  created_at: string;
};

const dateTimeFmt = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Argentina/Cordoba",
});

export default function ReferenceSeriesAdminPage() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">Series de referencia</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Los índices que publican otros, cargados una vez para todos los estudios. Cada valor nuevo o rectificado
          llega en el acto a los estudios que adoptaron la serie. Para rectificar un mes, pegalo de nuevo con el valor
          correcto: el anterior queda registrado.{" "}
          <Link href="/admin/cobros" className="underline">
            Ir a cobros
          </Link>
        </p>
      </div>
      <Suspense fallback={<CardSkeleton label="Cargando series…" lines={6} />}>
        <SeriesAdmin />
      </Suspense>
    </div>
  );
}

async function SeriesAdmin() {
  await requireUser();
  const supabase = await createClient();
  // Solo la administración de la plataforma: para cualquier otro, la página no existe.
  const { data: isAdmin } = await supabase.rpc("am_platform_admin");
  if (isAdmin !== true) notFound();

  const [{ data: seriesData }, { data: revisionData }] = await Promise.all([
    supabase
      .from("reference_series_summary")
      .select("code, name, unit, publisher, source_url, note, months, provisional_months, last_period, last_value")
      .order("position"),
    supabase
      .from("reference_value_revisions")
      .select("id, series_code, period, old_value, new_value, old_provisional, new_provisional, note, actor_email, created_at")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  const series = (seriesData ?? []) as Series[];
  const revisions = (revisionData ?? []) as Revision[];
  const names = new Map(series.map((s) => [s.code, s.name]));

  return (
    <>
      <section className="card flex flex-col gap-4">
        <h2 className="font-medium">Cargar valores</h2>
        <SeriesPasteForm series={series.map(({ code, name, unit }) => ({ code, name, unit }))} />
      </section>

      <section className="card flex flex-col gap-4">
        <h2 className="font-medium">Series</h2>
        <ul className="flex flex-col divide-y divide-line">
          {series.map((s) => {
            const provisional = s.provisional_months;
            return (
              <li key={s.code} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-medium">{s.name}</span>
                  <span className="text-xs text-muted">{s.unit}</span>
                  {provisional > 0 && (
                    <StatusPill tone="warn">
                      {provisional} {provisional === 1 ? "provisorio" : "provisorios"}
                    </StatusPill>
                  )}
                  <span className="ml-auto font-mono text-sm">
                    {s.last_value !== null ? `${formatIndexValue(s.last_value)} · ${formatPeriod(s.last_period)}` : "Sin valores"}
                  </span>
                </div>
                <p className="text-xs text-muted">
                  {s.publisher}
                  {s.note && ` · ${s.note}`} · {s.months} {s.months === 1 ? "mes" : "meses"}
                  {s.source_url && (
                    <>
                      {" · "}
                      <a href={s.source_url} target="_blank" rel="noreferrer" className="underline">
                        fuente
                      </a>
                    </>
                  )}
                </p>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card flex flex-col gap-4">
        <h2 className="font-medium">Últimas rectificaciones</h2>
        {revisions.length === 0 ? (
          <p className="text-sm text-muted">Todavía no se rectificó ningún valor.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {revisions.map((r) => (
              <li key={r.id}>
                <span className="font-medium">{names.get(r.series_code) ?? r.series_code}</span> de{" "}
                {formatPeriod(r.period)}: <span className="font-mono">{formatIndexValue(r.old_value)}</span>
                {r.old_provisional && " (provisorio)"} → <span className="font-mono">{formatIndexValue(r.new_value)}</span>
                {r.new_provisional && " (provisorio)"}
                <span className="text-muted">
                  {" "}
                  · {r.actor_email ?? "plataforma"} · {dateTimeFmt.format(new Date(r.created_at))}
                  {r.note && ` · ${r.note}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
