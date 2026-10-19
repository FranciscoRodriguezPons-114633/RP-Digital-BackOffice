"use client";

import { FieldError, FormMessage, useActionForm } from "@/components/form";
import { decideChangeOrder } from "./actions";

export function DecisionForm({ token, recipientEmail }: { token: string; recipientEmail: string }) {
  const { state, pending, formProps } = useActionForm(decideChangeOrder.bind(null, token), { resetOnSuccess: false });
  return (
    <form {...formProps} className="flex flex-col gap-4">
      <label className="field">
        Tu nombre y apellido
        <input name="signer_name" required minLength={2} maxLength={120} autoComplete="name" className="input" />
      </label>
      <FieldError errors={state.errors?.signer_name} />
      <label className="field">
        Comentario (opcional)
        <textarea
          name="comment"
          rows={3}
          maxLength={1000}
          placeholder="Si la rechazás, contale al estudio por qué."
          className="input"
        />
      </label>
      <FieldError errors={state.errors?.comment} />
      <p className="text-xs text-muted">
        Queda registrado tu nombre, este correo ({recipientEmail}), la fecha y el contenido exacto de la orden.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="submit" name="decision" value="approved" disabled={pending} className="btn btn-primary sm:flex-1">
          {pending ? "Enviando…" : "Aprobar"}
        </button>
        <button
          type="submit"
          name="decision"
          value="rejected"
          disabled={pending}
          className="btn btn-secondary sm:flex-1"
        >
          Rechazar
        </button>
      </div>
      <FieldError errors={state.errors?.decision} />
      <FormMessage state={state} />
    </form>
  );
}
