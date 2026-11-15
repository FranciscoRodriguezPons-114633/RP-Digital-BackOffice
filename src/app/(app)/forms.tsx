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

// Va en el panel «Nuevo proyecto»: un campo debajo del otro. Al crear, la acción lleva al proyecto.
export function ProjectForm({ isOwner, projects = [] }: { isOwner: boolean; projects?: { id: string; name: string }[] }) {
  const { state, pending, formProps } = useActionForm(createProject);
  return (
    <form {...formProps} className="flex flex-col gap-4">
      <label className="field">
        Nombre
        <input name="name" required minLength={2} maxLength={160} placeholder="Edificio Alba" className="input" />
      </label>
      <FieldError errors={state.errors?.name} />
      <label className="field">
        Código
        <input name="code" maxLength={40} placeholder="EA-01" className="input" />
      </label>
      <label className="field">
        Cliente
        <input name="client_name" maxLength={160} placeholder="Desarrollos del Centro" className="input" />
      </label>
      {isOwner && (
        <>
          <label className="field">
            Arrancar con
            <select name="setup" defaultValue="template" aria-describedby="setup-ayuda" className="input">
              <option value="template">Las 4 etapas de honorarios habituales</option>
              {projects.map((p) => (
                <option key={p.id} value={`copy:${p.id}`}>
                  Las etapas y la lista de planos de «{p.name}»
                </option>
              ))}
              <option value="empty">Un proyecto vacío</option>
            </select>
            <span id="setup-ayuda" className="text-xs font-normal text-muted">
              Las habituales: croquis preliminar, anteproyecto, documentación de proyecto y dirección de obra.
            </span>
          </label>
          <label className="field">
            Moneda de los honorarios
            <select name="currency" defaultValue="USD" className="input">
              <option value="USD">Dólares (USD)</option>
              <option value="ARS">Pesos (ARS)</option>
            </select>
          </label>
        </>
      )}
      <SubmitButton pending={pending} pendingLabel="Creando…">Crear proyecto</SubmitButton>
      <FormMessage state={state} />
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
