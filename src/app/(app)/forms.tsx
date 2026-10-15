"use client";

import { FieldError, FormMessage, SubmitButton, useActionForm } from "@/components/form";
import { GUEST_KINDS, GUEST_KIND_LABEL } from "@/lib/validation";
import { createOrganization, createProject, inviteGuest, inviteMember } from "./actions";

export function OrganizationForm() {
  const { state, pending, formProps } = useActionForm(createOrganization);
  return (
    <form {...formProps} className="flex flex-col gap-4">
      <label className="field">
        Nombre del estudio
        <input name="name" required minLength={2} maxLength={120} placeholder="Estudio Pons" className="input" />
      </label>
      <FieldError errors={state.errors?.name} />
      <SubmitButton pending={pending} pendingLabel="Creando…">Crear estudio</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function ProjectForm({ isOwner }: { isOwner: boolean }) {
  const { state, pending, formProps } = useActionForm(createProject);
  return (
    <form {...formProps} className="grid gap-4 sm:grid-cols-[2fr_1fr_2fr_auto] sm:items-end">
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
      <SubmitButton pending={pending} pendingLabel="Creando…">Crear proyecto</SubmitButton>
      {isOwner && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm sm:col-span-4">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="template" defaultChecked className="size-4 accent-[var(--accent)]" />
            Crear las 4 etapas de honorarios (croquis, anteproyecto, documentación, dirección de obra)
          </label>
          <label className="flex items-center gap-2 text-muted">
            en
            <select name="currency" defaultValue="USD" className="input py-1">
              <option value="USD">USD</option>
              <option value="ARS">ARS</option>
            </select>
          </label>
        </div>
      )}
      <div className="sm:col-span-4">
        <FieldError errors={state.errors?.name} />
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function GuestInviteForm({ projectId }: { projectId: string }) {
  const { state, pending, formProps } = useActionForm(inviteGuest);
  return (
    <form {...formProps} className="grid gap-4 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
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
      <SubmitButton pending={pending} pendingLabel="Invitando…">Invitar</SubmitButton>
      <div className="sm:col-span-3">
        <FieldError errors={state.errors?.email} />
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function MemberInviteForm({ orgId }: { orgId: string }) {
  const { state, pending, formProps } = useActionForm(inviteMember);
  return (
    <form {...formProps} className="grid gap-4 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
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
      <SubmitButton pending={pending} pendingLabel="Invitando…">Invitar</SubmitButton>
      <div className="sm:col-span-3">
        <FieldError errors={state.errors?.email} />
        <FormMessage state={state} />
      </div>
    </form>
  );
}
