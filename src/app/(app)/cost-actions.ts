"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrg, requireUser } from "@/lib/dal";
import { dbErrorMessage } from "@/lib/errors";
import { fieldErrors, idSchema, memberCostSchema, type FormState } from "@/lib/validation";

const OWNER_ONLY = "Solo el dueño del estudio carga los costos por hora.";

function revalidateCosts() {
  revalidatePath("/equipo");
  revalidatePath("/recuperado");
}

export async function saveMemberCost(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const org = await getCurrentOrg();
  if (!org) return { ok: false, message: "Primero creá tu estudio." };
  if (org.role !== "owner") return { ok: false, message: OWNER_ONLY };
  const parsed = memberCostSchema.safeParse({
    user_id: formData.get("user_id"),
    hourly_cost: formData.get("hourly_cost"),
    currency: formData.get("currency"),
    valid_from: formData.get("valid_from"),
  });
  if (!parsed.success) return fieldErrors(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase
    .from("member_costs")
    .insert({ ...parsed.data, org_id: org.id, created_by: user.id });
  if (error?.code === "23505") {
    // Misma persona y misma fecha de vigencia: se corrige ese costo.
    const { data, error: updateError } = await supabase
      .from("member_costs")
      .update({ hourly_cost: parsed.data.hourly_cost, currency: parsed.data.currency })
      .eq("org_id", org.id)
      .eq("user_id", parsed.data.user_id)
      .eq("valid_from", parsed.data.valid_from)
      .select("id");
    if (updateError) return { ok: false, message: dbErrorMessage(updateError) };
    if (!data?.length) return { ok: false, message: OWNER_ONLY };
    revalidateCosts();
    return { ok: true, message: "Costo corregido para esa fecha." };
  }
  if (error?.code === "42501") return { ok: false, message: OWNER_ONLY };
  if (error) return { ok: false, message: dbErrorMessage(error) };

  revalidateCosts();
  return { ok: true, message: "Costo guardado. Las horas desde esa fecha ya lo usan." };
}

export async function deleteMemberCost(id: string): Promise<void> {
  await requireUser();
  if (!idSchema.safeParse(id).success) return;
  const supabase = await createClient();
  await supabase.from("member_costs").delete().eq("id", id);
  revalidateCosts();
}
