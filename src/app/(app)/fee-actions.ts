"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrg, requireUser } from "@/lib/dal";
import { dbErrorMessage } from "@/lib/errors";
import {
  CURRENCIES,
  fieldErrors,
  idSchema,
  stageSchema,
  timeEntrySchema,
  type FormState,
} from "@/lib/validation";

// Igual que en actions.ts: cada acción verifica la sesión; los permisos los aplica la base.

function stageInput(formData: FormData) {
  return {
    name: formData.get("name"),
    kind: formData.get("kind"),
    currency: formData.get("currency"),
    amount: formData.get("amount"),
    hourly_rate: formData.get("hourly_rate"),
    budget_hours: formData.get("budget_hours"),
  };
}

export async function applyFeeTemplate(projectId: string, formData: FormData): Promise<void> {
  await requireUser();
  if (!idSchema.safeParse(projectId).success) return;
  const currency = CURRENCIES.find((c) => c === formData.get("currency")) ?? "USD";
  const supabase = await createClient();
  await supabase.rpc("apply_fee_template", { p_project_id: projectId, p_currency: currency });
  revalidatePath(`/proyectos/${projectId}`);
}

export async function createStage(projectId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const org = await getCurrentOrg();
  if (!org || !idSchema.safeParse(projectId).success) return { ok: false, message: "Proyecto inválido." };

  const parsed = stageSchema.safeParse(stageInput(formData));
  if (!parsed.success) return fieldErrors(parsed.error);

  const supabase = await createClient();
  const { count } = await supabase
    .from("fee_stages")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId);

  const { error } = await supabase.from("fee_stages").insert({
    ...parsed.data,
    org_id: org.id,
    project_id: projectId,
    position: (count ?? 0) + 1,
    created_by: user.id,
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };

  revalidatePath(`/proyectos/${projectId}`);
  return { ok: true, message: `Etapa "${parsed.data.name}" agregada.` };
}

export async function updateStage(
  projectId: string,
  stageId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireUser();
  if (!idSchema.safeParse(stageId).success) return { ok: false, message: "Etapa inválida." };

  const parsed = stageSchema.safeParse(stageInput(formData));
  if (!parsed.success) return fieldErrors(parsed.error);

  const supabase = await createClient();
  const { data, error } = await supabase.from("fee_stages").update(parsed.data).eq("id", stageId).select("id");
  if (error) return { ok: false, message: dbErrorMessage(error) };
  if (!data?.length) return { ok: false, message: "Solo el dueño del estudio puede cambiar honorarios." };

  revalidatePath(`/proyectos/${projectId}`);
  return { ok: true, message: "Guardado." };
}

export async function deleteStage(projectId: string, stageId: string): Promise<FormState> {
  await requireUser();
  if (!idSchema.safeParse(stageId).success) return { ok: false, message: "Etapa inválida." };

  const supabase = await createClient();
  const { error } = await supabase.from("fee_stages").delete().eq("id", stageId);
  if (error?.code === "23503") {
    return { ok: false, message: "Esta etapa tiene horas cargadas: no se puede borrar." };
  }
  if (error) return { ok: false, message: dbErrorMessage(error) };

  revalidatePath(`/proyectos/${projectId}`);
  return { ok: true };
}

export async function createTimeEntry(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = timeEntrySchema.safeParse({
    stage_id: formData.get("stage_id"),
    hours: formData.get("hours_custom") || formData.get("hours"),
    work_date: formData.get("work_date"),
    note: formData.get("note") ?? undefined,
  });
  if (!parsed.success) return fieldErrors(parsed.error);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("time_entries")
    .insert({ ...parsed.data, user_id: user.id })
    .select("project_id")
    .single();
  if (error) return { ok: false, message: dbErrorMessage(error) };

  revalidatePath("/horas");
  revalidatePath(`/proyectos/${data.project_id}`);
  const h = String(parsed.data.hours).replace(".", ",");
  return { ok: true, message: `Listo: ${h} h cargadas.` };
}

export async function deleteTimeEntry(entryId: string): Promise<void> {
  await requireUser();
  if (!idSchema.safeParse(entryId).success) return;
  const supabase = await createClient();
  const { data } = await supabase.from("time_entries").delete().eq("id", entryId).select("project_id");
  revalidatePath("/horas");
  if (data?.[0]) revalidatePath(`/proyectos/${data[0].project_id}`);
}
