"use client";

import type { FormEvent } from "react";
import { FieldError, FormMessage, SubmitButton, useActionForm } from "@/components/form";
import { deleteMemberCost, saveMemberCost } from "./cost-actions";
import { CURRENCIES } from "@/lib/validation";

// ---------- Costo por hora (dueño) ----------

export function MemberCostForm({ members, today }: { members: { user_id: string; email: string }[]; today: string }) {
  const { state, pending, formProps } = useActionForm(saveMemberCost);
  return (
    <form {...formProps} className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_1fr_auto] sm:items-end">
      <label className="field">
        Persona
        <select name="user_id" required defaultValue={members[0]?.user_id} className="input">
          {members.map((m) => (
            <option key={m.user_id} value={m.user_id}>
              {m.email}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Costo por hora
        <input name="hourly_cost" inputMode="decimal" required placeholder="18.000" className="input" />
      </label>
      <label className="field">
        Moneda
        <select name="currency" defaultValue="ARS" className="input">
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Desde
        <input name="valid_from" type="date" required defaultValue={today} className="input" />
      </label>
      <SubmitButton pending={pending} pendingLabel="Guardando…">
        Guardar
      </SubmitButton>
      <div className="flex flex-col gap-1 sm:col-span-5">
        <FieldError errors={state.errors?.user_id} />
        <FieldError errors={state.errors?.hourly_cost} />
        <FieldError errors={state.errors?.valid_from} />
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function DeleteMemberCostButton({ id, label }: { id: string; label: string }) {
  function confirmDelete(event: FormEvent<HTMLFormElement>) {
    if (!window.confirm(`¿Borrar el costo ${label}? Las horas de esas fechas pasan a usar el costo anterior.`)) {
      event.preventDefault();
    }
  }
  return (
    <form action={deleteMemberCost.bind(null, id)} onSubmit={confirmDelete}>
      <SubmitButton variant="ghost" pendingLabel="…">
        Borrar
      </SubmitButton>
    </form>
  );
}
