"use client";

import { FieldError, FormMessage, SubmitButton, useActionForm } from "@/components/form";
import { PLANS, type PaidPlan } from "@/lib/plans";
import { decideBillingRequest, requestPaidPlan } from "./plan-actions";

export function BillingRequestForm({ defaultEmail }: { defaultEmail: string }) {
  const { state, pending, formProps } = useActionForm(requestPaidPlan, { resetOnSuccess: false });
  return (
    <form {...formProps} className="grid grid-cols-1 gap-3 sm:grid-cols-6">
      <fieldset className="flex flex-col gap-2 sm:col-span-3">
        <legend className="mb-1 text-sm font-medium">Plan</legend>
        {(Object.keys(PLANS) as PaidPlan[]).map((k) => (
          <label key={k} className="flex items-start gap-2 text-sm">
            <input type="radio" name="plan" value={k} defaultChecked={k === "estudio"} className="mt-1" />
            <span>
              {PLANS[k].name} · USD {PLANS[k].usd} por mes
              <span className="block text-xs text-muted">{PLANS[k].detail}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <fieldset className="flex flex-col gap-2 sm:col-span-3">
        <legend className="mb-1 text-sm font-medium">Pago</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="billing_cycle" value="monthly" defaultChecked /> Mensual
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="billing_cycle" value="yearly" /> Anual (dos meses gratis)
        </label>
      </fieldset>
      <label className="field sm:col-span-3">
        Razón social
        <input name="billing_name" required maxLength={160} placeholder="Estudio Pérez SRL" className="input" />
      </label>
      <label className="field sm:col-span-1">
        CUIT
        <input name="tax_id" required inputMode="numeric" placeholder="30-12345678-9" className="input" />
      </label>
      <label className="field sm:col-span-2">
        Correo para la factura
        <input name="billing_email" type="email" required defaultValue={defaultEmail} className="input" />
      </label>
      <div className="flex flex-col gap-1 sm:col-span-6">
        <FieldError errors={state.errors?.billing_name} />
        <FieldError errors={state.errors?.tax_id} />
        <FieldError errors={state.errors?.billing_email} />
        <p className="text-xs text-muted">
          El cobro es por transferencia contra factura, en pesos al tipo de cambio del día. Cuando llega el pago, tu
          estudio queda en el plan, sin cortes.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-6">
        <SubmitButton pending={pending} pendingLabel="Enviando…">Pedir el pase a pago</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function DecideBillingForm({ requestId, defaultPaidUntil }: { requestId: string; defaultPaidUntil: string }) {
  const { state, pending, formProps } = useActionForm(decideBillingRequest.bind(null, requestId), { resetOnSuccess: false });
  return (
    <form {...formProps} className="flex flex-wrap items-end gap-2">
      <label className="field">
        Pago hasta
        <input name="paid_until" type="date" defaultValue={defaultPaidUntil} className="input" />
      </label>
      <label className="field min-w-0 flex-1">
        Nota
        <input name="note" maxLength={500} placeholder="Transferencia del 20/10" className="input" />
      </label>
      <button type="submit" name="decision" value="approve" disabled={pending} className="btn btn-primary">
        Confirmar pago
      </button>
      <button type="submit" name="decision" value="reject" disabled={pending} className="btn btn-ghost border border-line">
        Rechazar
      </button>
      <div className="w-full">
        <FieldError errors={state.errors?.paid_until} />
        <FormMessage state={state} />
      </div>
    </form>
  );
}
