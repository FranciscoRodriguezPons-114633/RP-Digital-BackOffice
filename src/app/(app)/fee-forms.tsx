"use client";

import { useActionState } from "react";
import { FieldError, FormMessage, SubmitButton, useActionForm } from "@/components/form";
import { CURRENCIES, STAGE_KINDS, STAGE_KIND_LABEL, type FormState, type StageKind } from "@/lib/validation";
import { createStage, createTimeEntry, deleteStage, updateStage } from "./fee-actions";

export type StageValues = {
  id: string;
  name: string;
  kind: StageKind;
  currency: string;
  amount: string | number | null;
  hourly_rate: string | number | null;
  budget_hours: string | number | null;
};

const toInput = (v: string | number | null) => (v === null || v === undefined ? "" : String(v).replace(".", ","));

export function StageForm({ projectId, stage }: { projectId: string; stage?: StageValues }) {
  const action = stage ? updateStage.bind(null, projectId, stage.id) : createStage.bind(null, projectId);
  const { state, pending, formProps } = useActionForm(action, { resetOnSuccess: !stage });

  return (
    <form {...formProps} className="grid gap-3 sm:grid-cols-6 sm:items-end">
      <label className="field sm:col-span-2">
        Etapa
        <input name="name" required defaultValue={stage?.name} placeholder="Anteproyecto" className="input" />
      </label>
      <label className="field sm:col-span-2">
        Cómo se cobra
        <select name="kind" defaultValue={stage?.kind ?? "fixed"} className="input">
          {STAGE_KINDS.map((k) => (
            <option key={k} value={k}>{STAGE_KIND_LABEL[k]}</option>
          ))}
        </select>
      </label>
      <label className="field sm:col-span-2">
        Moneda
        <select name="currency" defaultValue={stage?.currency ?? "USD"} className="input">
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>{c === "USD" ? "Dólares (USD)" : "Pesos (ARS)"}</option>
          ))}
        </select>
      </label>
      <label className="field sm:col-span-2">
        Monto
        <input name="amount" inputMode="decimal" defaultValue={toInput(stage?.amount ?? null)} placeholder="7.200" className="input" />
      </label>
      <label className="field sm:col-span-2">
        Tarifa por hora
        <input name="hourly_rate" inputMode="decimal" defaultValue={toInput(stage?.hourly_rate ?? null)} placeholder="45" className="input" />
      </label>
      <label className="field sm:col-span-2">
        Horas previstas
        <input name="budget_hours" inputMode="decimal" defaultValue={toInput(stage?.budget_hours ?? null)} placeholder="90" className="input" />
      </label>
      <div className="flex flex-col gap-1 sm:col-span-6">
        <FieldError errors={state.errors?.name} />
        <FieldError errors={state.errors?.amount} />
        <FieldError errors={state.errors?.hourly_rate} />
        <FieldError errors={state.errors?.budget_hours} />
        <p className="text-xs text-muted">
          Monto fijo usa el monto. Por hora usa la tarifa por las horas cargadas. Fijo + horas extra suma
          la tarifa por cada hora que pase de las previstas.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-6">
        <SubmitButton pending={pending} pendingLabel="Guardando…">{stage ? "Guardar cambios" : "Agregar etapa"}</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function DeleteStageButton({ projectId, stageId }: { projectId: string; stageId: string }) {
  const [state, formAction] = useActionState<FormState>(deleteStage.bind(null, projectId, stageId), {});
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <SubmitButton variant="ghost" pendingLabel="Borrando…">Borrar etapa</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export type StageOption = { id: string; name: string };
export type ProjectStages = { projectId: string; projectName: string; stages: StageOption[] };

const QUICK_HOURS = ["1", "2", "4", "8"];

export function TimeEntryForm({
  groups,
  defaultStageId,
  today,
}: {
  groups: ProjectStages[];
  defaultStageId?: string;
  today: string;
}) {
  const { state, pending, formProps } = useActionForm(createTimeEntry);

  return (
    <form {...formProps} className="flex flex-col gap-5">
      <label className="field">
        Proyecto y etapa
        <select name="stage_id" required defaultValue={defaultStageId} className="input min-h-12 text-base">
          {groups.map((g) => (
            <optgroup key={g.projectId} label={g.projectName}>
              {g.stages.map((s) => (
                <option key={s.id} value={s.id}>{`${g.projectName} · ${s.name}`}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <FieldError errors={state.errors?.stage_id} />

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Horas</legend>
        <div className="grid grid-cols-4 gap-2">
          {QUICK_HOURS.map((h) => (
            <label key={h} className="chip">
              <input type="radio" name="hours" value={h} className="sr-only" />
              {h} h
            </label>
          ))}
        </div>
        <label className="field mt-1 font-normal">
          <span className="text-sm text-muted">Otra cantidad</span>
          <input name="hours_custom" inputMode="decimal" placeholder="Por ejemplo 2,5" className="input min-h-12 text-base" />
        </label>
      </fieldset>
      <FieldError errors={state.errors?.hours} />

      <div className="grid grid-cols-2 gap-3">
        <label className="field">
          Fecha
          <input name="work_date" type="date" required defaultValue={today} max={today} className="input min-h-12 text-base" />
        </label>
        <label className="field">
          Nota
          <input name="note" maxLength={500} placeholder="Opcional" className="input min-h-12 text-base" />
        </label>
      </div>
      <FieldError errors={state.errors?.work_date} />

      <SubmitButton pending={pending} pendingLabel="Guardando…">Guardar horas</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
