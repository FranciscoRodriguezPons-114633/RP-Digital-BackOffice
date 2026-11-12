import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatHours, formatMoney, sumAmounts } from "@/lib/format";

type Row = {
  stage_id: string;
  stage_name: string;
  position: number;
  currency: string;
  income: string;
  cost: string;
  profit: string;
  hours_costed: string;
  hours_missing_cost: string;
};
type Missing = { user_id: string; hours: string };
type Member = { user_id: string; email: string };

// Rentabilidad por etapa y moneda (solo el dueño, con Finanzas de obra). Sin convertir monedas:
// si las etapas cobran en dólares y los costos están en pesos, se ven las dos columnas.
export async function ProfitabilitySection({ projectId, orgId }: { projectId: string; orgId: string }) {
  const supabase = await createClient();
  const [{ data: rowData }, { data: missingData }, { data: memberData }] = await Promise.all([
    supabase
      .from("stage_profitability")
      .select("stage_id, stage_name, position, currency, income, cost, profit, hours_costed, hours_missing_cost")
      .eq("project_id", projectId)
      .order("position")
      .order("currency"),
    supabase.from("missing_member_costs").select("user_id, hours").eq("project_id", projectId),
    supabase.rpc("list_org_members", { p_org_id: orgId }),
  ]);
  const rows = (rowData ?? []) as Row[];
  if (rows.length === 0) return null;
  const missing = (missingData ?? []) as Missing[];
  const emails = new Map(((memberData ?? []) as Member[]).map((m) => [m.user_id, m.email]));

  const currencies = [...new Set(rows.map((r) => r.currency))].sort();
  const totals = currencies.map((currency) => {
    const list = rows.filter((r) => r.currency === currency);
    return {
      currency,
      income: sumAmounts(list.map((r) => r.income)),
      cost: sumAmounts(list.map((r) => r.cost)),
      profit: sumAmounts(list.map((r) => r.profit)),
    };
  });

  return (
    <section className="card flex flex-col gap-4" aria-labelledby="rentabilidad">
      <div>
        <h2 id="rentabilidad" className="font-medium">
          Rentabilidad
        </h2>
        <p className="mt-1 text-sm text-muted">
          Honorario actualizado más adicionales aprobados, menos las horas cargadas por el costo de cada persona a esa
          fecha. Cada moneda por separado, sin convertir. Solo la ves vos.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {totals.map((t) => (
          <div key={t.currency} className="rounded-lg bg-sunken p-4">
            <p className="text-xs text-muted">Resultado en {t.currency}</p>
            <p className={`font-mono text-2xl font-semibold ${t.profit < 0 ? "text-danger" : ""}`}>
              {formatMoney(t.profit, t.currency)}
            </p>
            <p className="font-mono text-xs text-muted">
              {formatMoney(t.income, t.currency)} − {formatMoney(t.cost, t.currency)}
            </p>
          </div>
        ))}
      </div>

      {missing.length > 0 && (
        <p className="rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">
          Falta el costo por hora de{" "}
          {missing.map((m, i) => (
            <span key={m.user_id}>
              {i > 0 && (i === missing.length - 1 ? " y " : ", ")}
              {emails.get(m.user_id) ?? "un ex miembro"} ({formatHours(m.hours)})
            </span>
          ))}
          : esas horas no se restan.{" "}
          <Link href="/equipo" className="underline">
            Cargalo en Equipo
          </Link>
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left text-muted">
              <th className="py-2 pr-4 font-medium">Etapa</th>
              <th className="py-2 pr-4 text-right font-medium">Ingreso</th>
              <th className="py-2 pr-4 text-right font-medium">Costo de horas</th>
              <th className="py-2 text-right font-medium">Resultado</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.stage_id}-${r.currency}`} className="border-b border-line last:border-0">
                <td className="py-2 pr-4">
                  {r.stage_name}
                  {currencies.length > 1 && <span className="ml-2 text-xs text-muted">{r.currency}</span>}
                </td>
                <td className="py-2 pr-4 text-right font-mono">{formatMoney(r.income, r.currency)}</td>
                <td className="py-2 pr-4 text-right font-mono">
                  {formatMoney(r.cost, r.currency)}
                  {Number(r.hours_costed) > 0 && (
                    <span className="block text-xs text-muted">{formatHours(r.hours_costed)}</span>
                  )}
                </td>
                <td className={`py-2 text-right font-mono ${Number(r.profit) < 0 ? "text-danger" : ""}`}>
                  {formatMoney(r.profit, r.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
