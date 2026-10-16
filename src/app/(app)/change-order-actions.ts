"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrg, requireUser } from "@/lib/dal";
import { dbErrorMessage } from "@/lib/errors";
import { formatIndexValue, formatPeriod } from "@/lib/format";
import {
  changeOrderCode,
  changeOrderSchema,
  fieldErrors,
  idSchema,
  indexValueSchema,
  voidSchema,
  type FormState,
} from "@/lib/validation";

// ---------- Índices ----------

export async function addIndexValue(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const org = await getCurrentOrg();
  if (!org) return { ok: false, message: "Primero creá tu estudio." };

  const parsed = indexValueSchema.safeParse({
    name: formData.get("name"),
    period: formData.get("period"),
    value: formData.get("value"),
  });
  if (!parsed.success) return fieldErrors(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase
    .from("price_indices")
    .insert({ ...parsed.data, org_id: org.id, created_by: user.id });
  if (error?.code === "23505") return correctIndexValue(org.id, parsed.data);
  if (error) return { ok: false, message: dbErrorMessage(error) };

  revalidatePath("/indices");
  return { ok: true, message: "Valor guardado. Las etapas con este índice ya están actualizadas." };
}

// Cargar de nuevo un mes que ya tiene valor lo corrige (sin borrarlo antes, así las etapas
// que lo usan como base no quedan un momento sin ajustar). La auditoría guarda el valor anterior.
async function correctIndexValue(
  orgId: string,
  { name, period, value }: { name: string; period: string; value: number | null },
): Promise<FormState> {
  const supabase = await createClient();
  const { data: current } = await supabase
    .from("price_indices")
    .select("id, value")
    .eq("org_id", orgId)
    .eq("name", name)
    .eq("period", period)
    .maybeSingle();
  if (!current) return { ok: false, message: dbErrorMessage(null) };
  const label = `${name} de ${formatPeriod(period)}`;
  if (Number(current.value) === value) return { ok: true, message: `${label} ya tenía ese valor.` };

  const { data, error } = await supabase.from("price_indices").update({ value }).eq("id", current.id).select("id");
  if (error) return { ok: false, message: dbErrorMessage(error) };
  if (!data?.length) return { ok: false, message: "Solo el dueño del estudio puede corregir índices." };

  revalidatePath("/indices");
  return {
    ok: true,
    message: `${label} corregido: pasó de ${formatIndexValue(current.value)} a ${formatIndexValue(value ?? 0)}.`,
  };
}

export async function deleteIndexValue(id: string): Promise<void> {
  await requireUser();
  if (!idSchema.safeParse(id).success) return;
  const supabase = await createClient();
  await supabase.from("price_indices").delete().eq("id", id);
  revalidatePath("/indices");
}

// ---------- Órdenes de cambio ----------

function changeOrderInput(formData: FormData) {
  return {
    stage_id: formData.get("stage_id"),
    title: formData.get("title"),
    description: formData.get("description") ?? undefined,
    hours: formData.get("hours"),
    amount: formData.get("amount"),
    affected_documents: formData.get("affected_documents"),
  };
}

export async function createChangeOrder(projectId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  const parsed = changeOrderSchema.safeParse(changeOrderInput(formData));
  if (!parsed.success) return fieldErrors(parsed.error);

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("create_change_order", {
      p_stage_id: parsed.data.stage_id,
      p_title: parsed.data.title,
      p_description: parsed.data.description ?? "",
      p_hours: parsed.data.hours,
      p_amount: parsed.data.amount,
      p_affected_documents: parsed.data.affected_documents,
    })
    .single<{ id: string; number: number }>();
  if (error) return { ok: false, message: dbErrorMessage(error) };

  revalidatePath(`/proyectos/${projectId}`);
  return { ok: true, message: `${changeOrderCode(data.number)} creada como borrador.` };
}

export async function updateChangeOrder(
  projectId: string,
  orderId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireUser();
  if (!idSchema.safeParse(orderId).success) return { ok: false, message: "Orden inválida." };
  const parsed = changeOrderSchema.safeParse(changeOrderInput(formData));
  if (!parsed.success) return fieldErrors(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_change_order", {
    p_id: orderId,
    p_stage_id: parsed.data.stage_id,
    p_title: parsed.data.title,
    p_description: parsed.data.description ?? "",
    p_hours: parsed.data.hours,
    p_amount: parsed.data.amount,
    p_affected_documents: parsed.data.affected_documents,
  });
  if (error?.code === "22023") return { ok: false, message: "Esta orden ya no se puede editar." };
  if (error) return { ok: false, message: dbErrorMessage(error) };

  revalidatePath(`/proyectos/${projectId}`);
  return { ok: true, message: "Cambios guardados." };
}

export async function voidChangeOrder(
  projectId: string,
  orderId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireUser();
  if (!idSchema.safeParse(orderId).success) return { ok: false, message: "Orden inválida." };
  const parsed = voidSchema.safeParse({ reason: formData.get("reason") });
  if (!parsed.success) return fieldErrors(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase.rpc("void_change_order", { p_id: orderId, p_reason: parsed.data.reason });
  if (error) return { ok: false, message: dbErrorMessage(error) };

  revalidatePath(`/proyectos/${projectId}`);
  return { ok: true, message: "Orden anulada." };
}
