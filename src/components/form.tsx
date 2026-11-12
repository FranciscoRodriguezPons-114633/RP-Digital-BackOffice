"use client";

import { useFormStatus } from "react-dom";
import { startTransition, useActionState, useEffect, useRef, type FormEvent, type ReactNode } from "react";
import type { FormState } from "@/lib/validation";

// Formularios con Server Actions que NO borran lo escrito cuando hay un error.
// React vacía un <form action> al terminar cada envío, aunque la acción devuelva un
// error de validación. Acá el envío pasa por onSubmit (sin vaciado automático) y el
// formulario se limpia solo si la acción respondió ok y resetOnSuccess es true.
// Sin JavaScript sigue funcionando por el atributo action.
export function useActionForm<S extends FormState = FormState>(
  action: (state: S, formData: FormData) => Promise<S>,
  { resetOnSuccess = true }: { resetOnSuccess?: boolean } = {},
) {
  const [awaitedState, formAction, pending] = useActionState<S, FormData>(
    action as (state: Awaited<S>, formData: FormData) => Promise<S>,
    {} as Awaited<S>,
  );
  const state = awaitedState as S;
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    const data = new FormData(event.currentTarget, submitter);
    startTransition(() => formAction(data));
  }

  return { state, pending, formProps: { ref, action: formAction, onSubmit } };
}

export function SubmitButton({
  children,
  pendingLabel,
  variant = "primary",
  pending: pendingProp,
}: {
  children: ReactNode;
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  pending?: boolean;
}) {
  const status = useFormStatus();
  const pending = pendingProp ?? status.pending;
  return (
    <button type="submit" disabled={pending} className={`btn btn-${variant}`}>
      {pending ? (pendingLabel ?? "Guardando…") : children}
    </button>
  );
}

export function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return (
    <p role="alert" className="-mt-2 text-sm text-danger">
      {errors[0]}
    </p>
  );
}

// Un campo con su error pegado abajo, para formularios largos: el error se lee al lado de lo
// que hay que corregir, no al final del formulario. `children` es el control (input, select).
export function Field({
  label,
  errors,
  className = "",
  children,
}: {
  label: ReactNode;
  errors?: string[];
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label className="field">
        {label}
        {children}
      </label>
      {errors?.length ? (
        <p role="alert" className="text-sm text-danger">
          {errors[0]}
        </p>
      ) : null}
    </div>
  );
}

export function FormMessage({ state }: { state: FormState }) {
  if (!state.message) return null;
  return (
    <p role={state.ok ? "status" : "alert"} className={`text-sm ${state.ok ? "text-ok" : "text-danger"}`}>
      {state.message}
    </p>
  );
}
