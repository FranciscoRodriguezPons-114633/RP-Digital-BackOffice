"use client";

import { useState, type FormEvent } from "react";
import { Field, FormMessage, SubmitButton, useActionForm } from "@/components/form";
import {
  FEES_MODES,
  FEES_MODE_LABEL,
  MARKUP_METHODS,
  MARKUP_METHOD_HINT,
  MARKUP_METHOD_LABEL,
  OVERHEAD_KINDS,
  OVERHEAD_KIND_LABEL,
  markup,
  type FeesMode,
  type MarkupMethod,
  type OverheadKind,
} from "@/lib/budgets";
import { formatMoney } from "@/lib/format";
import { parseDecimal } from "@/lib/validation";
import {
  applyOverheadTemplate,
  deleteOverhead,
  saveOverhead,
  setBudgetFees,
  setBudgetMarkup,
} from "./budget-actions";

// Formularios del precio de un presupuesto (sprint 7): personal e indirectos por mes de obra,
// honorarios de arquitectos y pase.

const plain = (n: string | number | null | undefined) => (n === null || n === undefined ? "" : String(Number(n)).replace(".", ","));
const num = (v: string) => {
  const n = parseDecimal(v);
  return n === null || Number.isNaN(n) ? 0 : n;
};

type Ids = { projectId: string; budgetId: string; currency: string };

export type OverheadValues = {
  id: string;
  kind: OverheadKind;
  concept: string;
  months: string;
  monthly_cost: string | null;
};

// Alta o edición de un concepto, con el total en vivo (meses × costo mensual).
export function OverheadForm({ projectId, budgetId, currency, overhead }: Ids & { overhead?: OverheadValues }) {
  const { state, pending, formProps } = useActionForm(saveOverhead.bind(null, projectId, budgetId, overhead?.id ?? null), {
    resetOnSuccess: !overhead,
  });
  const [months, setMonths] = useState(plain(overhead?.months) || "1");
  const [cost, setCost] = useState(plain(overhead?.monthly_cost));
  const total = Math.round(num(months) * num(cost) * 100) / 100;

  return (
    <form {...formProps} className="flex flex-col gap-4">
      <Field label="Tipo" errors={state.errors?.kind}>
        <select name="kind" defaultValue={overhead?.kind ?? "staff"} className="input">
          {OVERHEAD_KINDS.map((k) => (
            <option key={k} value={k}>
              {OVERHEAD_KIND_LABEL[k]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Concepto" errors={state.errors?.concept}>
        <input name="concept" required minLength={2} maxLength={120} defaultValue={overhead?.concept} placeholder="Capataz" className="input" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Meses" errors={state.errors?.months}>
          <input name="months" inputMode="decimal" required value={months} onChange={(e) => setMonths(e.target.value)} className="input" />
        </Field>
        <Field label={`Costo por mes (${currency})`} errors={state.errors?.monthly_cost}>
          <input
            name="monthly_cost"
            inputMode="decimal"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            placeholder="Sin cargar"
            className="input"
          />
        </Field>
      </div>
      <p className="text-sm">
        Total: <span className="font-mono font-semibold">{cost.trim() ? formatMoney(total, currency) : "sin costo, no suma"}</span>
      </p>
      <SubmitButton pending={pending} pendingLabel="Guardando…">
        {overhead ? "Guardar" : "Agregar"}
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function DeleteOverheadButton({ projectId, budgetId, id, concept }: Omit<Ids, "currency"> & { id: string; concept: string }) {
  const { state, pending, formProps } = useActionForm(() => deleteOverhead(projectId, budgetId, id));
  function confirmDelete(event: FormEvent<HTMLFormElement>) {
    if (!window.confirm(`¿Borrar «${concept}»?`)) {
      event.preventDefault();
      return;
    }
    formProps.onSubmit(event);
  }
  return (
    <form {...formProps} onSubmit={confirmDelete} className="flex flex-wrap items-center gap-2">
      <SubmitButton pending={pending} variant="ghost" pendingLabel="…">
        Borrar
      </SubmitButton>
      {state.ok === false && <FormMessage state={state} />}
    </form>
  );
}

export function OverheadTemplateButton({ projectId, budgetId }: Omit<Ids, "currency">) {
  const { state, pending, formProps } = useActionForm(() => applyOverheadTemplate(projectId, budgetId));
  return (
    <form {...formProps} className="flex flex-col items-start gap-2">
      <SubmitButton pending={pending} variant="secondary" pendingLabel="Cargando…">
        Cargar la plantilla
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

// Honorarios: de las etapas (foto del momento) o por horas × costo por hora.
export function FeesForm({
  projectId,
  budgetId,
  currency,
  mode,
  hours,
  rate,
  stagesSummary,
}: Ids & { mode: FeesMode; hours: string | null; rate: string | null; stagesSummary: string | null }) {
  const { state, pending, formProps } = useActionForm(setBudgetFees.bind(null, projectId, budgetId), { resetOnSuccess: false });
  const [chosen, setChosen] = useState<FeesMode>(mode);
  const [h, setH] = useState(plain(hours));
  const [r, setR] = useState(plain(rate));

  return (
    <form {...formProps} className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">De dónde salen</legend>
        {FEES_MODES.map((m) => (
          <label key={m} className="flex items-start gap-2 text-sm">
            <input type="radio" name="fees_mode" value={m} checked={chosen === m} onChange={() => setChosen(m)} className="mt-1" />
            <span>
              {FEES_MODE_LABEL[m]}
              {m === "stages" && (
                <span className="block text-xs text-muted">
                  {stagesSummary
                    ? `Hoy suman ${stagesSummary}, con índice y adicionales aprobados. Se toma el monto de este momento.`
                    : "El proyecto no tiene etapas de honorarios."}
                </span>
              )}
            </span>
          </label>
        ))}
      </fieldset>
      {chosen === "hours" && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Horas estimadas" errors={state.errors?.fees_hours}>
            <input name="fees_hours" inputMode="decimal" value={h} onChange={(e) => setH(e.target.value)} className="input" />
          </Field>
          <Field label={`Costo por hora (${currency})`} errors={state.errors?.fees_hourly_rate}>
            <input name="fees_hourly_rate" inputMode="decimal" value={r} onChange={(e) => setR(e.target.value)} className="input" />
          </Field>
          <p className="col-span-2 text-sm">
            Honorarios: <span className="font-mono font-semibold">{formatMoney(Math.round(num(h) * num(r) * 100) / 100, currency)}</span>
          </p>
        </div>
      )}
      <div>
        <SubmitButton pending={pending} variant="secondary" pendingLabel="Guardando…">
          {chosen === "stages" ? "Tomar de las etapas" : "Guardar"}
        </SubmitButton>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

// Pase: los tres porcentajes y el método, con el resultado en vivo sobre el costo actual.
export function MarkupForm({
  projectId,
  budgetId,
  currency,
  cost,
  fees,
  values,
}: Ids & {
  cost: number;
  fees: number;
  values: { overhead_pct: string; profit_pct: string; tax_pct: string; markup_method: MarkupMethod };
}) {
  const { state, pending, formProps } = useActionForm(setBudgetMarkup.bind(null, projectId, budgetId), { resetOnSuccess: false });
  const [gg, setGg] = useState(plain(values.overhead_pct));
  const [b, setB] = useState(plain(values.profit_pct));
  const [t, setT] = useState(plain(values.tax_pct));
  const [method, setMethod] = useState<MarkupMethod>(values.markup_method);
  const m = markup(cost, { overheadPct: num(gg), profitPct: num(b), taxPct: num(t), method }, fees);

  const pct = (label: string, name: string, value: string, set: (v: string) => void, hint?: string) => (
    <Field label={label} errors={state.errors?.[name]}>
      <div className="flex items-center gap-2">
        <input name={name} inputMode="decimal" value={value} onChange={(e) => set(e.target.value)} placeholder="0" className="input w-24" />
        <span className="text-sm text-muted">%</span>
      </div>
      {hint && <span className="text-xs text-warn">{hint}</span>}
    </Field>
  );

  return (
    <form {...formProps} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {pct("Gastos generales", "overhead_pct", gg, setGg)}
        {pct("Beneficio", "profit_pct", b, setB)}
        {pct("Impuestos", "tax_pct", t, setT, "A validar con el contador")}
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Cómo se aplica</legend>
        {MARKUP_METHODS.map((k) => (
          <label key={k} className="flex items-start gap-2 text-sm">
            <input type="radio" name="markup_method" value={k} checked={method === k} onChange={() => setMethod(k)} className="mt-1" />
            <span>
              {MARKUP_METHOD_LABEL[k]}
              <span className="block text-xs text-muted">{MARKUP_METHOD_HINT[k]}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <p className="rounded-[var(--radius-control)] bg-sunken px-3 py-2 text-sm">
        Pase: <span className="font-mono font-semibold">{formatMoney(m.amount, currency)}</span>
        {m.coefficient !== null && (
          <span className="text-muted"> · coeficiente {m.coefficient.toFixed(3).replace(".", ",")}</span>
        )}
        {" · "}precio sin IVA <span className="font-mono font-semibold">{formatMoney(m.price, currency)}</span>
      </p>
      <div>
        <SubmitButton pending={pending} variant="secondary" pendingLabel="Guardando…">
          Guardar el pase
        </SubmitButton>
      </div>
      <FormMessage state={state} />
    </form>
  );
}
