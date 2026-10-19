import { Suspense, type ReactNode } from "react";
import { PageSkeleton } from "@/components/skeleton";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrg, requireUser } from "@/lib/dal";
import { formatMoney, formatPeriod, sumAmounts } from "@/lib/format";
import { changeOrderCode } from "@/lib/validation";

export const metadata: Metadata = { title: "Lo recuperado" };

type ProjectRow = {
  project_id: string;
  project_name: string;
  currency: string;
  approved_count: number;
  approved_amount: string;
  pending_count: number;
  pending_amount: string;
  draft_count: number;
  draft_amount: string;
  rejected_count: number;
};

type MonthRow = { currency: string; month: string; approved_count: number; approved_amount: string };

type PendingRow = {
  id: string;
  number: number;
  title: string;
  amount: string;
  currency: string;
  sent_at: string | null;
  project_id: string;
  projects: { name: string } | null;
};

const dateFmt = new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeZone: "America/Argentina/Cordoba" });
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export default function RecoveredPage() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">Lo recuperado</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Adicionales que los clientes aprobaron, por proyecto y por mes, y lo que todavía espera respuesta. Lo
          aprobado ya suma a los honorarios de cada etapa. Los montos van por moneda, sin convertir.
        </p>
      </div>
      <Suspense fallback={<PageSkeleton title={false} cards={2} list={false} />}>
        <Recovered />
      </Suspense>
    </div>
  );
}

async function Recovered() {
  await requireUser();
  const org = await getCurrentOrg();
  if (!org) redirect("/proyectos");

  const supabase = await createClient();
  const [{ data: projectData }, { data: monthData }, { data: pendingData }] = await Promise.all([
    supabase
      .from("change_order_recovery")
      .select("project_id, project_name, currency, approved_count, approved_amount, pending_count, pending_amount, draft_count, draft_amount, rejected_count")
      .order("project_name"),
    supabase
      .from("change_order_recovery_monthly")
      .select("currency, month, approved_count, approved_amount")
      .order("month", { ascending: false })
      .limit(24),
    supabase
      .from("change_orders")
      .select("id, number, title, amount, currency, sent_at, project_id, projects(name)")
      .eq("status", "sent")
      .order("sent_at"),
  ]);
  const projects = (projectData ?? []) as ProjectRow[];
  const months = (monthData ?? []) as MonthRow[];
  const pending = (pendingData ?? []) as unknown as PendingRow[];

  if (projects.length === 0) {
    return (
      <p className="text-sm text-muted">
        Todavía no hay órdenes de cambio. Se crean desde cada proyecto, en la sección Órdenes de cambio.
      </p>
    );
  }

  const currencies = [...new Set(projects.map((p) => p.currency))].sort();
  const totals = currencies.map((currency) => {
    const rows = projects.filter((p) => p.currency === currency);
    const count = (k: "approved_count" | "pending_count" | "draft_count") => rows.reduce((n, r) => n + r[k], 0);
    return {
      currency,
      approved: sumAmounts(rows.map((r) => r.approved_amount)),
      approvedCount: count("approved_count"),
      pending: sumAmounts(rows.map((r) => r.pending_amount)),
      pendingCount: count("pending_count"),
      draft: sumAmounts(rows.map((r) => r.draft_amount)),
      draftCount: count("draft_count"),
    };
  });

  return (
    <>
      {totals.map((t) => (
        <section key={t.currency} aria-label={`Totales en ${t.currency}`} className="grid gap-4 sm:grid-cols-3">
          <StatTile label={`Aprobado · ${t.currency}`} value={formatMoney(t.approved, t.currency)} hero>
            {plural(t.approvedCount, "orden aprobada", "órdenes aprobadas")}
          </StatTile>
          <StatTile label="Esperando al cliente" value={formatMoney(t.pending, t.currency)}>
            {plural(t.pendingCount, "orden enviada", "órdenes enviadas")}
          </StatTile>
          <StatTile label="Borradores sin enviar" value={formatMoney(t.draft, t.currency)}>
            {plural(t.draftCount, "borrador", "borradores")}
          </StatTile>
        </section>
      ))}

      <section className="card flex flex-col gap-4">
        <h2 className="font-medium">Por proyecto</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left text-muted">
                <th className="py-2 pr-4 font-medium">Proyecto</th>
                <th className="py-2 pr-4 text-right font-medium">Aprobado</th>
                <th className="py-2 pr-4 text-right font-medium">Esperando</th>
                <th className="py-2 pr-4 text-right font-medium">Borradores</th>
                <th className="py-2 text-right font-medium">Rechazadas</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={`${p.project_id}-${p.currency}`} className="border-b border-line align-top last:border-0">
                  <td className="py-3 pr-4">
                    <Link href={`/proyectos/${p.project_id}#ordenes`} className="font-medium hover:underline">
                      {p.project_name}
                    </Link>
                  </td>
                  <AmountCell amount={p.approved_amount} count={p.approved_count} currency={p.currency} />
                  <AmountCell amount={p.pending_amount} count={p.pending_count} currency={p.currency} />
                  <AmountCell amount={p.draft_amount} count={p.draft_count} currency={p.currency} />
                  <td className="py-3 text-right font-mono text-muted">{p.rejected_count || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card flex flex-col gap-4">
          <h2 className="font-medium">Aprobado por mes</h2>
          {months.length === 0 ? (
            <p className="text-sm text-muted">Todavía ningún cliente aprobó una orden.</p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-left text-muted">
                  <th className="py-2 pr-4 font-medium">Mes</th>
                  <th className="py-2 pr-4 text-right font-medium">Órdenes</th>
                  <th className="py-2 text-right font-medium">Aprobado</th>
                </tr>
              </thead>
              <tbody>
                {months.map((m) => (
                  <tr key={`${m.month}-${m.currency}`} className="border-b border-line last:border-0">
                    <td className="py-2 pr-4 capitalize">{formatPeriod(m.month)}</td>
                    <td className="py-2 pr-4 text-right font-mono text-muted">{m.approved_count}</td>
                    <td className="py-2 text-right font-mono whitespace-nowrap">{formatMoney(m.approved_amount, m.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="card flex flex-col gap-4">
          <h2 className="font-medium">Esperando aprobación</h2>
          {pending.length === 0 ? (
            <p className="text-sm text-muted">No hay órdenes esperando al cliente.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line text-sm">
              {pending.map((o) => (
                <li key={o.id} className="flex flex-col gap-0.5 py-2 first:pt-0">
                  <div className="flex items-baseline gap-3">
                    <Link href={`/proyectos/${o.project_id}#ordenes`} className="min-w-0 flex-1 font-medium hover:underline">
                      {changeOrderCode(o.number)} · {o.title}
                    </Link>
                    <span className="font-mono whitespace-nowrap">{formatMoney(o.amount, o.currency)}</span>
                  </div>
                  <span className="text-xs text-muted">
                    {o.projects?.name}
                    {o.sent_at && ` · enviada el ${dateFmt.format(new Date(o.sent_at))}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

function StatTile({ label, value, hero = false, children }: { label: string; value: string; hero?: boolean; children: ReactNode }) {
  return (
    <div className="card flex flex-col gap-1">
      <span className="text-sm text-muted">{label}</span>
      <span className={`font-mono font-semibold whitespace-nowrap ${hero ? "text-3xl" : "text-2xl"}`}>{value}</span>
      <span className="text-xs text-muted">{children}</span>
    </div>
  );
}

function AmountCell({ amount, count, currency }: { amount: string; count: number; currency: string }) {
  return (
    <td className="py-3 pr-4 text-right">
      {count === 0 ? (
        <span className="text-muted">—</span>
      ) : (
        <>
          <div className="font-mono whitespace-nowrap">{formatMoney(amount, currency)}</div>
          <div className="text-xs text-muted">{plural(count, "orden", "órdenes")}</div>
        </>
      )}
    </td>
  );
}
