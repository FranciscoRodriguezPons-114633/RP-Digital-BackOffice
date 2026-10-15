import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatHours, formatMoney } from "@/lib/format";
import { STAGE_KIND_LABEL, type StageKind } from "@/lib/validation";
import { applyFeeTemplate } from "../../fee-actions";
import { DeleteStageButton, StageForm } from "../../fee-forms";
import { SubmitButton } from "@/components/form";

type StageSummary = {
  id: string;
  name: string;
  position: number;
  kind: StageKind;
  currency: string;
  amount: string | null;
  hourly_rate: string | null;
  budget_hours: string | null;
  hours_used: string;
  fee_amount: string | null;
  budget_pct: string | null;
};

function hoursTone(pct: number | null) {
  if (pct === null) return { bar: "bg-line", text: "text-muted", label: "" };
  if (pct >= 100) return { bar: "bg-danger", text: "text-danger", label: "Pasó lo previsto" };
  if (pct >= 80) return { bar: "bg-warn", text: "text-warn", label: "Cerca del límite" };
  return { bar: "bg-accent", text: "text-muted", label: "" };
}

export async function FeesSection({ projectId, isOwner }: { projectId: string; isOwner: boolean }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("fee_stage_summary")
    .select("id, name, position, kind, currency, amount, hourly_rate, budget_hours, hours_used, fee_amount, budget_pct")
    .eq("project_id", projectId)
    .order("position")
    .order("created_at");
  const stages = (data ?? []) as StageSummary[];

  const totals = new Map<string, number>();
  for (const s of stages) totals.set(s.currency, (totals.get(s.currency) ?? 0) + Number(s.fee_amount ?? 0));

  return (
    <section className="card flex flex-col gap-6">
      <div className="flex flex-wrap items-start gap-3">
        <div>
          <h2 className="font-medium">Honorarios por etapa</h2>
          <p className="mt-1 text-sm text-muted">Horas cargadas contra las previstas en cada etapa.</p>
        </div>
        {stages.length > 0 && (
          <Link href={`/horas?proyecto=${projectId}`} className="btn btn-primary ml-auto">Cargar horas</Link>
        )}
      </div>

      {stages.length === 0 ? (
        isOwner ? (
          <form action={applyFeeTemplate.bind(null, projectId)} className="flex flex-col gap-3 rounded-md border border-dashed border-line p-4">
            <p className="text-sm">
              Empezá con las cuatro etapas habituales: croquis preliminar, anteproyecto, documentación de
              proyecto y dirección de obra. Después cargás los montos.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <label className="field">
                Moneda
                <select name="currency" defaultValue="USD" className="input">
                  <option value="USD">Dólares (USD)</option>
                  <option value="ARS">Pesos (ARS)</option>
                </select>
              </label>
              <SubmitButton pendingLabel="Creando…">Usar la plantilla</SubmitButton>
            </div>
          </form>
        ) : (
          <p className="text-sm text-muted">Todavía no hay etapas. Las carga el dueño del estudio.</p>
        )
      ) : (
        <>
        <ul className="flex flex-col divide-y divide-line sm:hidden">
          {stages.map((s) => {
            const pct = s.budget_pct === null ? null : Number(s.budget_pct);
            const tone = hoursTone(pct);
            return (
              <li key={s.id} className="flex flex-col gap-1.5 py-3 first:pt-0">
                <div className="flex items-baseline gap-3">
                  <span className="font-medium">{s.name}</span>
                  <span className="ml-auto font-mono text-sm whitespace-nowrap">{formatMoney(s.fee_amount, s.currency)}</span>
                </div>
                <div className="text-xs text-muted">
                  {STAGE_KIND_LABEL[s.kind]}
                  {s.hourly_rate !== null && ` · ${formatMoney(s.hourly_rate, s.currency)}/h`}
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span className="font-mono whitespace-nowrap">
                    {formatHours(s.hours_used)}
                    {s.budget_hours !== null && <span className="text-muted"> / {formatHours(s.budget_hours)}</span>}
                  </span>
                  {pct !== null && (
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line" aria-hidden="true">
                      <div className={`h-full ${tone.bar}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                    </div>
                  )}
                  {pct !== null && <span className={`text-xs ${tone.text}`}>{`${String(pct).replace(".", ",")}%`}</span>}
                </div>
                {tone.label && <span className={`text-xs ${tone.text}`}>{tone.label}</span>}
              </li>
            );
          })}
          {[...totals.entries()].map(([currency, total]) => (
            <li key={currency} className="flex items-baseline gap-3 pt-3 font-medium">
              Total {currency}
              <span className="ml-auto font-mono whitespace-nowrap">{formatMoney(total, currency)}</span>
            </li>
          ))}
        </ul>
        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left text-muted">
                <th className="py-2 pr-4 font-medium">Etapa</th>
                <th className="py-2 pr-4 font-medium">Honorario</th>
                <th className="py-2 pr-4 font-medium">Horas</th>
                <th className="py-2 font-medium"><span className="sr-only">Estado</span></th>
              </tr>
            </thead>
            <tbody>
              {stages.map((s) => {
                const pct = s.budget_pct === null ? null : Number(s.budget_pct);
                const tone = hoursTone(pct);
                return (
                  <tr key={s.id} className="border-b border-line align-top last:border-0">
                    <td className="py-3 pr-4">
                      <div className="font-medium">{s.name}</div>
                      <div className="text-xs text-muted">
                        {STAGE_KIND_LABEL[s.kind]}
                        {s.hourly_rate !== null && ` · ${formatMoney(s.hourly_rate, s.currency)}/h`}
                      </div>
                    </td>
                    <td className="py-3 pr-4 font-mono whitespace-nowrap">{formatMoney(s.fee_amount, s.currency)}</td>
                    <td className="py-3 pr-4">
                      <div className="font-mono whitespace-nowrap">
                        {formatHours(s.hours_used)}
                        {s.budget_hours !== null && <span className="text-muted"> / {formatHours(s.budget_hours)}</span>}
                      </div>
                      {pct !== null && (
                        <div className="mt-1.5 h-1.5 w-32 overflow-hidden rounded-full bg-line" aria-hidden="true">
                          <div className={`h-full ${tone.bar}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                        </div>
                      )}
                    </td>
                    <td className={`py-3 text-xs whitespace-nowrap ${tone.text}`}>
                      {pct !== null && `${String(pct).replace(".", ",")}%`}
                      {tone.label && <div>{tone.label}</div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              {[...totals.entries()].map(([currency, total]) => (
                <tr key={currency}>
                  <td className="pt-3 pr-4 font-medium">Total {currency}</td>
                  <td className="pt-3 pr-4 font-mono font-medium whitespace-nowrap">{formatMoney(total, currency)}</td>
                  <td colSpan={2} />
                </tr>
              ))}
            </tfoot>
          </table>
        </div>
        </>
      )}

      {isOwner && stages.length > 0 && (
        <div className="flex flex-col gap-2">
          {stages.map((s) => (
            <details key={s.id} className="rounded-md border border-line">
              <summary className="cursor-pointer px-4 py-3 text-sm">Editar «{s.name}»</summary>
              <div className="flex flex-col gap-4 border-t border-line p-4">
                <StageForm
                  projectId={projectId}
                  stage={{
                    id: s.id,
                    name: s.name,
                    kind: s.kind,
                    currency: s.currency,
                    amount: s.amount,
                    hourly_rate: s.hourly_rate,
                    budget_hours: s.budget_hours,
                  }}
                />
                <DeleteStageButton projectId={projectId} stageId={s.id} />
              </div>
            </details>
          ))}
          <details className="rounded-md border border-dashed border-line">
            <summary className="cursor-pointer px-4 py-3 text-sm">Agregar etapa</summary>
            <div className="border-t border-line p-4">
              <StageForm projectId={projectId} />
            </div>
          </details>
        </div>
      )}
    </section>
  );
}
