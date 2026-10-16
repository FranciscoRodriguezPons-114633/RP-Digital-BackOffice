import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatFactor, formatHours, formatMoney, formatPeriod } from "@/lib/format";
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
  index_name: string | null;
  index_base_period: string | null;
  index_base_value: string | null;
  index_current_value: string | null;
  index_current_period: string | null;
  index_missing: boolean;
  fee_adjusted: string | null;
  extras_approved: string;
  extras_pending: string;
  total_amount: string | null;
};

function hoursTone(pct: number | null) {
  if (pct === null) return { bar: "bg-line", text: "text-muted", label: "" };
  if (pct >= 100) return { bar: "bg-danger", text: "text-danger", label: "Pasó lo previsto" };
  if (pct >= 80) return { bar: "bg-warn", text: "text-warn", label: "Cerca del límite" };
  return { bar: "bg-accent", text: "text-muted", label: "" };
}

const isAdjusted = (s: StageSummary) => s.index_current_value !== null && s.index_base_value !== null;

function FeeCell({ s }: { s: StageSummary }) {
  return (
    <>
      <div className="font-mono whitespace-nowrap">{formatMoney(s.fee_adjusted, s.currency)}</div>
      {isAdjusted(s) && Number(s.fee_adjusted) !== Number(s.fee_amount) && (
        <div className="text-xs whitespace-nowrap text-muted">
          {formatMoney(s.fee_amount, s.currency)} {formatFactor(s.index_current_value!, s.index_base_value!)}
        </div>
      )}
      {isAdjusted(s) && (
        <div className="text-xs text-muted">
          {s.index_name}: {formatPeriod(s.index_base_period)} → {formatPeriod(s.index_current_period)}
        </div>
      )}
      {s.index_missing && (
        <Link href="/indices" className="text-xs text-warn underline">
          Falta {s.index_name} de {formatPeriod(s.index_base_period)}
        </Link>
      )}
    </>
  );
}

function ExtrasCell({ s }: { s: StageSummary }) {
  const approved = Number(s.extras_approved);
  const pending = Number(s.extras_pending);
  return (
    <>
      <div className="font-mono whitespace-nowrap">{approved > 0 ? `+ ${formatMoney(approved, s.currency)}` : "—"}</div>
      {pending > 0 && (
        <div className="text-xs whitespace-nowrap text-muted">{formatMoney(pending, s.currency)} sin aprobar</div>
      )}
    </>
  );
}

function HoursBar({ pct, tone, className }: { pct: number | null; tone: ReturnType<typeof hoursTone>; className: string }) {
  if (pct === null) return null;
  return (
    <div className={`h-1.5 overflow-hidden rounded-full bg-line ${className}`} aria-hidden="true">
      <div className={`h-full ${tone.bar}`} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  );
}

function OverBudgetLink({ s, pct }: { s: StageSummary; pct: number | null }) {
  if (pct === null || pct < 100) return null;
  return (
    <Link href={`?oc_etapa=${s.id}#ordenes`} className="text-xs text-accent underline">
      ¿Cambios del cliente? Crear orden de cambio
    </Link>
  );
}

export async function FeesSection({ projectId, isOwner }: { projectId: string; isOwner: boolean }) {
  const supabase = await createClient();
  const [{ data }, { data: indexRows }] = await Promise.all([
    supabase
      .from("fee_stage_summary")
      .select(
        "id, name, position, kind, currency, amount, hourly_rate, budget_hours, hours_used, fee_amount, budget_pct, " +
          "index_name, index_base_period, index_base_value, index_current_value, index_current_period, index_missing, " +
          "fee_adjusted, extras_approved, extras_pending, total_amount",
      )
      .eq("project_id", projectId)
      .order("position")
      .order("created_at"),
    isOwner ? supabase.from("price_indices").select("name") : Promise.resolve({ data: [] as { name: string }[] }),
  ]);
  const stages = (data ?? []) as unknown as StageSummary[];
  const indexNames = [...new Set((indexRows ?? []).map((r) => r.name))].sort((a, b) => a.localeCompare(b, "es"));

  const totals = new Map<string, { total: number; extras: number }>();
  for (const s of stages) {
    const t = totals.get(s.currency) ?? { total: 0, extras: 0 };
    t.total += Number(s.total_amount ?? 0);
    t.extras += Number(s.extras_approved ?? 0);
    totals.set(s.currency, t);
  }

  return (
    <section className="card flex flex-col gap-6">
      <div className="flex flex-wrap items-start gap-3">
        <div>
          <h2 className="font-medium">Honorarios por etapa</h2>
          <p className="mt-1 text-sm text-muted">Honorario actualizado, adicionales aprobados y horas contra lo previsto.</p>
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
          {/* Teléfono: una tarjeta por etapa */}
          <ul className="flex flex-col divide-y divide-line sm:hidden">
            {stages.map((s) => {
              const pct = s.budget_pct === null ? null : Number(s.budget_pct);
              const tone = hoursTone(pct);
              return (
                <li key={s.id} className="flex flex-col gap-1.5 py-3 first:pt-0">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{s.name}</div>
                      <div className="text-xs text-muted">
                        {STAGE_KIND_LABEL[s.kind]}
                        {s.hourly_rate !== null && ` · ${formatMoney(s.hourly_rate, s.currency)}/h`}
                      </div>
                    </div>
                    <div className="text-right text-sm">
                      <FeeCell s={s} />
                    </div>
                  </div>
                  {(Number(s.extras_approved) > 0 || Number(s.extras_pending) > 0) && (
                    <div className="flex items-baseline gap-3 text-sm">
                      <span className="text-muted">Adicionales</span>
                      <div className="ml-auto text-right">
                        <ExtrasCell s={s} />
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-3 text-sm">
                    <span className="font-mono whitespace-nowrap">
                      {formatHours(s.hours_used)}
                      {s.budget_hours !== null && <span className="text-muted"> / {formatHours(s.budget_hours)}</span>}
                    </span>
                    <HoursBar pct={pct} tone={tone} className="flex-1" />
                    {pct !== null && <span className={`text-xs ${tone.text}`}>{`${String(pct).replace(".", ",")}%`}</span>}
                  </div>
                  {tone.label && <span className={`text-xs ${tone.text}`}>{tone.label}</span>}
                  <OverBudgetLink s={s} pct={pct} />
                </li>
              );
            })}
            {[...totals.entries()].map(([currency, t]) => (
              <li key={currency} className="flex items-baseline gap-3 pt-3 font-medium">
                Total {currency}
                <span className="ml-auto font-mono whitespace-nowrap">{formatMoney(t.total, currency)}</span>
              </li>
            ))}
          </ul>

          {/* Computadora: tabla */}
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-left text-muted">
                  <th className="py-2 pr-4 font-medium">Etapa</th>
                  <th className="py-2 pr-4 font-medium">Honorario</th>
                  <th className="py-2 pr-4 font-medium">Adicionales</th>
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
                      <td className="py-3 pr-4"><FeeCell s={s} /></td>
                      <td className="py-3 pr-4"><ExtrasCell s={s} /></td>
                      <td className="py-3 pr-4">
                        <div className="font-mono whitespace-nowrap">
                          {formatHours(s.hours_used)}
                          {s.budget_hours !== null && <span className="text-muted"> / {formatHours(s.budget_hours)}</span>}
                        </div>
                        <HoursBar pct={pct} tone={tone} className="mt-1.5 w-32" />
                      </td>
                      <td className={`py-3 text-xs ${tone.text}`}>
                        <div className="whitespace-nowrap">{pct !== null && `${String(pct).replace(".", ",")}%`}</div>
                        {tone.label && <div className="whitespace-nowrap">{tone.label}</div>}
                        <OverBudgetLink s={s} pct={pct} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                {[...totals.entries()].map(([currency, t]) => (
                  <tr key={currency}>
                    <td className="pt-3 pr-4 font-medium">Total {currency}</td>
                    <td colSpan={2} className="pt-3 pr-4">
                      <span className="font-mono font-medium whitespace-nowrap">{formatMoney(t.total, currency)}</span>
                      {t.extras > 0 && (
                        <span className="ml-2 text-xs text-muted">con {formatMoney(t.extras, currency)} de adicionales</span>
                      )}
                    </td>
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
                  indexNames={indexNames}
                  stage={{
                    id: s.id,
                    name: s.name,
                    kind: s.kind,
                    currency: s.currency,
                    amount: s.amount,
                    hourly_rate: s.hourly_rate,
                    budget_hours: s.budget_hours,
                    index_name: s.index_name,
                    index_base_period: s.index_base_period,
                  }}
                />
                <DeleteStageButton projectId={projectId} stageId={s.id} />
              </div>
            </details>
          ))}
          <details className="rounded-md border border-dashed border-line">
            <summary className="cursor-pointer px-4 py-3 text-sm">Agregar etapa</summary>
            <div className="border-t border-line p-4">
              <StageForm projectId={projectId} indexNames={indexNames} />
            </div>
          </details>
        </div>
      )}
    </section>
  );
}
