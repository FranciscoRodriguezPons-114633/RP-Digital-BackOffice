"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrg, requireUser } from "@/lib/dal";
import { dbErrorMessage } from "@/lib/errors";
import {
  fieldErrors,
  guestInviteSchema,
  idSchema,
  memberInviteSchema,
  organizationSchema,
  projectSchema,
  type FormState,
} from "@/lib/validation";

// Cada acción vuelve a verificar la sesión: no se confía en que la página esté protegida.
// Los permisos finos los aplica la base (RLS + RPC); acá solo se valida la forma.

export async function createOrganization(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  const parsed = organizationSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) return fieldErrors(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_organization", { p_name: parsed.data.name });
  if (error) return { ok: false, message: dbErrorMessage(error) };

  redirect("/proyectos");
}

export async function createProject(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const org = await getCurrentOrg();
  if (!org) return { ok: false, message: "Primero creá tu estudio." };

  const parsed = projectSchema.safeParse({
    name: formData.get("name"),
    code: formData.get("code") ?? undefined,
    client_name: formData.get("client_name") ?? undefined,
  });
  if (!parsed.success) return fieldErrors(parsed.error);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .insert({ org_id: org.id, created_by: user.id, ...parsed.data })
    .select("id")
    .single();
  if (error) return { ok: false, message: dbErrorMessage(error) };

  if (org.role === "owner" && formData.get("template") === "on") {
    const currency = formData.get("currency") === "ARS" ? "ARS" : "USD";
    await supabase.rpc("apply_fee_template", { p_project_id: data.id, p_currency: currency });
  }

  redirect(`/proyectos/${data.id}`);
}

export async function inviteGuest(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  const parsed = guestInviteSchema.safeParse({
    project_id: formData.get("project_id"),
    email: formData.get("email"),
    kind: formData.get("kind"),
  });
  if (!parsed.success) return fieldErrors(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase.rpc("invite_guest", {
    p_project_id: parsed.data.project_id,
    p_email: parsed.data.email,
    p_kind: parsed.data.kind,
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };

  revalidatePath(`/proyectos/${parsed.data.project_id}`);
  return { ok: true, message: `Listo: le llega un correo a ${parsed.data.email}.` };
}

export async function removeGuest(projectId: string, guestId: string): Promise<void> {
  await requireUser();
  if (!idSchema.safeParse(guestId).success || !idSchema.safeParse(projectId).success) return;

  const supabase = await createClient();
  await supabase.rpc("remove_guest", { p_guest_id: guestId });
  revalidatePath(`/proyectos/${projectId}`);
}

export async function inviteMember(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  const parsed = memberInviteSchema.safeParse({
    org_id: formData.get("org_id"),
    email: formData.get("email"),
    role: formData.get("role") ?? undefined,
  });
  if (!parsed.success) return fieldErrors(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase.rpc("invite_member", {
    p_org_id: parsed.data.org_id,
    p_email: parsed.data.email,
    p_role: parsed.data.role,
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };

  revalidatePath("/equipo");
  return { ok: true, message: `Invitación enviada a ${parsed.data.email}.` };
}
