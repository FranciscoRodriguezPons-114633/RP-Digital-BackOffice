"use client";

import { useActionState } from "react";
import { FieldError, FormMessage, SubmitButton } from "@/components/form";
import { GUEST_KINDS, GUEST_KIND_LABEL, type FormState } from "@/lib/validation";
import { createOrganization, createProject, inviteGuest, inviteMember } from "./actions";

export function OrganizationForm() {
  const [state, action] = useActionState<FormState, FormData>(createOrganization, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="field">
        Nombre del estudio
        <input name="name" required minLength={2} maxLength={120} placeholder="Estudio Pons" className="input" />
      </label>
      <FieldError errors={state.errors?.name} />
      <SubmitButton pendingLabel="Creando…">Crear estudio</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function ProjectForm() {
  const [state, action] = useActionState<FormState, FormData>(createProject, {});
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-[2fr_1fr_2fr_auto] sm:items-end">
      <label className="field">
        Nombre
        <input name="name" required minLength={2} maxLength={160} placeholder="Edificio Alba" className="input" />
      </label>
      <label className="field">
        Código
        <input name="code" maxLength={40} placeholder="EA-01" className="input" />
      </label>
      <label className="field">
        Cliente
        <input name="client_name" maxLength={160} placeholder="Desarrollos del Centro" className="input" />
      </label>
      <SubmitButton pendingLabel="Creando…">Crear proyecto</SubmitButton>
      <div className="sm:col-span-4">
        <FieldError errors={state.errors?.name} />
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function GuestInviteForm({ projectId }: { projectId: string }) {
  const [state, action] = useActionState<FormState, FormData>(inviteGuest, {});
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
      <input type="hidden" name="project_id" value={projectId} />
      <label className="field">
        Correo
        <input name="email" type="email" required placeholder="cliente@gmail.com" className="input" />
      </label>
      <label className="field">
        Rol
        <select name="kind" defaultValue="client" className="input">
          {GUEST_KINDS.map((k) => (
            <option key={k} value={k}>
              {GUEST_KIND_LABEL[k]}
            </option>
          ))}
        </select>
      </label>
      <SubmitButton pendingLabel="Invitando…">Invitar</SubmitButton>
      <div className="sm:col-span-3">
        <FieldError errors={state.errors?.email} />
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function MemberInviteForm({ orgId }: { orgId: string }) {
  const [state, action] = useActionState<FormState, FormData>(inviteMember, {});
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
      <input type="hidden" name="org_id" value={orgId} />
      <label className="field">
        Correo
        <input name="email" type="email" required placeholder="colega@estudio.com" className="input" />
      </label>
      <label className="field">
        Rol
        <select name="role" defaultValue="member" className="input">
          <option value="member">Miembro</option>
          <option value="owner">Dueño</option>
        </select>
      </label>
      <SubmitButton pendingLabel="Invitando…">Invitar</SubmitButton>
      <div className="sm:col-span-3">
        <FieldError errors={state.errors?.email} />
        <FormMessage state={state} />
      </div>
    </form>
  );
}
