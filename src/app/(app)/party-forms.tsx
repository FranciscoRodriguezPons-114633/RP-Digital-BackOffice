"use client";

import type { FormEvent } from "react";
import { Field, FormMessage, SubmitButton, useActionForm } from "@/components/form";
import {
  GROSS_INCOME_CONDITIONS,
  GROSS_INCOME_CONDITION_LABEL,
  PARTY_ROLES,
  PARTY_ROLE_LABEL,
  VAT_CONDITIONS,
  VAT_CONDITION_LABEL,
  formatCuit,
  type GrossIncomeCondition,
  type PartyRole,
  type VatCondition,
} from "@/lib/validation";
import { createParty, deleteParty, updateParty } from "./party-actions";

// ---------- Terceros ----------

export type PartyValues = {
  id: string;
  name: string;
  tax_id: string | null;
  roles: PartyRole[];
  vat_condition: VatCondition | null;
  gross_income_condition: GrossIncomeCondition | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
};

export function PartyForm({ party }: { party?: PartyValues }) {
  const action = party ? updateParty.bind(null, party.id) : createParty;
  const { state, pending, formProps } = useActionForm(action, { resetOnSuccess: !party });
  const prefix = party?.id ?? "new";
  return (
    <form {...formProps} className="grid gap-3 sm:grid-cols-6">
      <Field label="Nombre o razón social" errors={state.errors?.name} className="sm:col-span-4">
        <input name="name" required minLength={2} maxLength={200} defaultValue={party?.name} placeholder="Hormigonera Sur SA" className="input" />
      </Field>
      <Field label="CUIT (opcional)" errors={state.errors?.tax_id} className="sm:col-span-2">
        <input name="tax_id" inputMode="numeric" defaultValue={party?.tax_id ? formatCuit(party.tax_id) : ""} placeholder="30-71234567-1" className="input" />
      </Field>
      <fieldset className="flex flex-wrap gap-x-5 gap-y-2 sm:col-span-6">
        <legend className="mb-1 text-sm font-medium">Rol</legend>
        {PARTY_ROLES.map((r) => (
          <label key={r} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="roles" value={r} defaultChecked={party ? party.roles.includes(r) : false} id={`${prefix}-${r}`} />
            {PARTY_ROLE_LABEL[r]}
          </label>
        ))}
        {state.errors?.roles?.length ? (
          <p role="alert" className="w-full text-sm text-danger">
            {state.errors.roles[0]}
          </p>
        ) : null}
      </fieldset>
      <label className="field sm:col-span-3">
        Condición frente al IVA
        <select name="vat_condition" defaultValue={party?.vat_condition ?? ""} className="input">
          <option value="">Sin indicar</option>
          {VAT_CONDITIONS.map((v) => (
            <option key={v} value={v}>
              {VAT_CONDITION_LABEL[v]}
            </option>
          ))}
        </select>
      </label>
      <label className="field sm:col-span-3">
        Ingresos brutos
        <select name="gross_income_condition" defaultValue={party?.gross_income_condition ?? ""} className="input">
          <option value="">Sin indicar</option>
          {GROSS_INCOME_CONDITIONS.map((v) => (
            <option key={v} value={v}>
              {GROSS_INCOME_CONDITION_LABEL[v]}
            </option>
          ))}
        </select>
      </label>
      <Field label="Correo" errors={state.errors?.email} className="sm:col-span-3">
        <input name="email" type="email" maxLength={200} defaultValue={party?.email ?? ""} className="input" />
      </Field>
      <label className="field sm:col-span-3">
        Teléfono
        <input name="phone" maxLength={40} defaultValue={party?.phone ?? ""} className="input" />
      </label>
      <label className="field sm:col-span-6">
        Dirección
        <input name="address" maxLength={200} defaultValue={party?.address ?? ""} className="input" />
      </label>
      <label className="field sm:col-span-6">
        Notas
        <textarea name="notes" rows={2} maxLength={2000} defaultValue={party?.notes ?? ""} className="input" />
      </label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-6">
        <SubmitButton pending={pending} pendingLabel="Guardando…">
          {party ? "Guardar cambios" : "Registrar tercero"}
        </SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function DeletePartyForm({ id, name }: { id: string; name: string }) {
  const { state, pending, formProps } = useActionForm(() => deleteParty(id));
  function confirmDelete(event: FormEvent<HTMLFormElement>) {
    if (!window.confirm(`¿Borrar a ${name}?`)) {
      event.preventDefault();
      return;
    }
    formProps.onSubmit(event);
  }
  return (
    <form {...formProps} onSubmit={confirmDelete} className="flex flex-wrap items-center gap-3">
      <SubmitButton pending={pending} variant="danger" pendingLabel="Borrando…">
        Borrar
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
