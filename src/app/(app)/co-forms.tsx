"use client";

import type { FormEvent } from "react";
import { FieldError, FormMessage, SubmitButton, useActionForm } from "@/components/form";
import { INDEX_SUGGESTIONS } from "@/lib/validation";
import { addIndexValue, createChangeOrder, deleteIndexValue, updateChangeOrder, voidChangeOrder } from "./change-order-actions";

export type StageChoice = { id: string; name: string; currency: string; hourly_rate: string | null };
export type ChangeOrderValues = {
  id: string;
  stage_id: string;
  title: string;
  description: string | null;
  hours: string | null;
  amount: string;
  affected_documents: string[];
};

const toInput = (v: string | number | null | undefined) => (v === null || v === undefined ? "" : String(v).replace(".", ","));

export function ChangeOrderForm({
  projectId,
  stages,
  order,
  defaultStageId,
}: {
  projectId: string;
  stages: StageChoice[];
  order?: ChangeOrderValues;
  defaultStageId?: string;
}) {
  const action = order ? updateChangeOrder.bind(null, projectId, order.id) : createChangeOrder.bind(null, projectId);
  const { state, pending, formProps } = useActionForm(action, { resetOnSuccess: !order });

  return (
    <form {...formProps} className="grid gap-3 sm:grid-cols-6">
      <label className="field sm:col-span-4">
        Qué se pidió
        <input name="title" required minLength={3} maxLength={160} defaultValue={order?.title} placeholder="Carpinterías de PVC en fachada norte" className="input" />
      </label>
      <label className="field sm:col-span-2">
        Etapa
        <select name="stage_id" required defaultValue={order?.stage_id ?? defaultStageId ?? stages[0]?.id} className="input">
          {stages.map((s) => (
            <option key={s.id} value={s.id}>{`${s.name} (${s.currency})`}</option>
          ))}
        </select>
      </label>
      <label className="field sm:col-span-6">
        Detalle
        <textarea name="description" rows={3} maxLength={4000} defaultValue={order?.description ?? ""} placeholder="Qué incluye el cambio y qué no." className="input" />
      </label>
      <label className="field sm:col-span-2">
        Horas
        <input name="hours" inputMode="decimal" defaultValue={toInput(order?.hours)} placeholder="24" className="input" />
      </label>
      <label className="field sm:col-span-2">
        Monto
        <input name="amount" inputMode="decimal" required defaultValue={toInput(order?.amount)} placeholder="1.800" className="input" />
      </label>
      <label className="field sm:col-span-2">
        Documentos afectados
        <input name="affected_documents" defaultValue={order?.affected_documents.join(", ")} placeholder="A-301, A-302" className="input" />
      </label>
      <div className="flex flex-col gap-1 sm:col-span-6">
        <FieldError errors={state.errors?.title} />
        <FieldError errors={state.errors?.amount} />
        <FieldError errors={state.errors?.hours} />
        <FieldError errors={state.errors?.affected_documents} />
        <p className="text-xs text-muted">
          La moneda es la de la etapa. Queda como borrador; el envío al cliente para que la apruebe llega en la
          próxima versión.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-6">
        <SubmitButton pending={pending} pendingLabel="Guardando…">{order ? "Guardar cambios" : "Crear orden"}</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function VoidChangeOrderForm({ projectId, orderId }: { projectId: string; orderId: string }) {
  const { state, pending, formProps } = useActionForm(voidChangeOrder.bind(null, projectId, orderId));
  return (
    <form {...formProps} className="flex flex-wrap items-end gap-3">
      <label className="field min-w-0 flex-1">
        Motivo de la anulación
        <input name="reason" required minLength={3} maxLength={500} placeholder="El cliente desistió" className="input" />
      </label>
      <SubmitButton pending={pending} variant="ghost" pendingLabel="Anulando…">Anular orden</SubmitButton>
      <div className="w-full">
        <FieldError errors={state.errors?.reason} />
        <FormMessage state={state} />
      </div>
    </form>
  );
}

// Borrar un valor pide confirmación y avisa si alguna etapa lo usa como mes base,
// porque esas etapas vuelven a su monto sin ajustar.
export function DeleteIndexValueForm({ id, label, baseStages }: { id: string; label: string; baseStages: number }) {
  function confirmDelete(event: FormEvent<HTMLFormElement>) {
    const warning =
      baseStages === 0
        ? ""
        : baseStages === 1
          ? "\n\nUna etapa lo usa como mes base y va a quedar sin ajustar."
          : `\n\n${baseStages} etapas lo usan como mes base y van a quedar sin ajustar.`;
    if (!window.confirm(`¿Borrar ${label}?${warning}`)) event.preventDefault();
  }
  return (
    <form action={deleteIndexValue.bind(null, id)} onSubmit={confirmDelete}>
      <SubmitButton variant="ghost" pendingLabel="…">Borrar</SubmitButton>
    </form>
  );
}

export function IndexValueForm({ names }: { names: string[] }) {
  const { state, pending, formProps } = useActionForm(addIndexValue);
  const options = [...new Set([...names, ...INDEX_SUGGESTIONS])];
  return (
    <form {...formProps} className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end">
      <label className="field">
        Índice
        <input name="name" list="index-names" required defaultValue={names[0] ?? ""} placeholder="ICC Córdoba" className="input" />
        <datalist id="index-names">
          {options.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
      </label>
      <label className="field">
        Mes
        <input name="period" type="month" required className="input" />
      </label>
      <label className="field">
        Valor
        <input name="value" inputMode="decimal" required placeholder="112,34" className="input" />
      </label>
      <SubmitButton pending={pending} pendingLabel="Guardando…">Guardar</SubmitButton>
      <div className="flex flex-col gap-1 sm:col-span-4">
        <FieldError errors={state.errors?.name} />
        <FieldError errors={state.errors?.period} />
        <FieldError errors={state.errors?.value} />
        <FormMessage state={state} />
      </div>
    </form>
  );
}
