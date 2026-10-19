"use client";

import { FieldError, FormMessage, SubmitButton, useActionForm } from "@/components/form";
import { createDeadline } from "./deadline-actions";

export function DeadlineForm({
  projects,
  projectId,
}: {
  projects?: { id: string; name: string }[];
  projectId?: string;
}) {
  const { state, pending, formProps } = useActionForm(createDeadline);
  return (
    <form {...formProps} className="grid grid-cols-1 gap-3 sm:grid-cols-6">
      <label className="field sm:col-span-3">
        Qué vence
        <input name="title" required minLength={2} maxLength={160} placeholder="Presentación municipal" className="input" />
      </label>
      <label className="field sm:col-span-1">
        Fecha
        <input name="due_date" type="date" required className="input" />
      </label>
      <label className="field sm:col-span-2">
        Avisarme (días antes)
        <input name="notify_days" defaultValue="30, 15, 5" className="input" />
      </label>
      {projectId ? (
        <input type="hidden" name="project_id" value={projectId} />
      ) : (
        <label className="field sm:col-span-3">
          Proyecto
          <select name="project_id" defaultValue="" className="input">
            <option value="">Del estudio (sin proyecto)</option>
            {projects?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className={`field ${projectId ? "sm:col-span-6" : "sm:col-span-3"}`}>
        Nota (opcional)
        <input name="notes" maxLength={1000} placeholder="Llevar planos firmados" className="input" />
      </label>
      <div className="flex flex-col gap-1 sm:col-span-6">
        <FieldError errors={state.errors?.title} />
        <FieldError errors={state.errors?.due_date} />
        <FieldError errors={state.errors?.notify_days} />
        <p className="text-xs text-muted">Te llega un correo una sola vez por cada aviso. Marcalo como hecho y dejan de llegar.</p>
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-6">
        <SubmitButton pending={pending} pendingLabel="Guardando…">Agregar vencimiento</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
