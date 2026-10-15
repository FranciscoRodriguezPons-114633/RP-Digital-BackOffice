"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { sendMagicLink } from "./actions";
import { SubmitButton, FieldError, FormMessage } from "@/components/form";
import type { FormState } from "@/lib/validation";

export function LoginForm() {
  const params = useSearchParams();
  const [state, action] = useActionState<FormState, FormData>(sendMagicLink, {});
  const authError = params.get("error");

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={params.get("next") ?? "/"} />
      <label className="flex flex-col gap-1 text-sm font-medium">
        Correo
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="vos@estudio.com"
          className="input"
        />
      </label>
      <FieldError errors={state.errors?.email} />
      <SubmitButton pendingLabel="Enviando…">Enviarme el enlace</SubmitButton>
      <FormMessage state={state} />
      {authError && !state.message && (
        <p role="alert" className="text-sm text-red-700">
          El enlace no es válido o ya venció. Pedí uno nuevo.
        </p>
      )}
    </form>
  );
}
