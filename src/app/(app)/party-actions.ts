"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrg, requireUser } from "@/lib/dal";
import { dbErrorMessage } from "@/lib/errors";
import { fieldErrors, idSchema, partySchema, type FormState } from "@/lib/validation";

function partyInput(formData: FormData) {
  return {
    name: formData.get("name"),
    tax_id: formData.get("tax_id") ?? undefined,
    roles: formData.getAll("roles"),
    vat_condition: formData.get("vat_condition") ?? undefined,
    gross_income_condition: formData.get("gross_income_condition") ?? undefined,
    email: formData.get("email") ?? undefined,
    phone: formData.get("phone") ?? undefined,
    address: formData.get("address") ?? undefined,
    notes: formData.get("notes") ?? undefined,
  };
}

const DUPLICATE: FormState = { ok: false, errors: { tax_id: ["Ya tenés un tercero con ese CUIT"] } };

export async function createParty(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const org = await getCurrentOrg();
  if (!org) return { ok: false, message: "Primero creá tu estudio." };
  const parsed = partySchema.safeParse(partyInput(formData));
  if (!parsed.success) return fieldErrors(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase.from("parties").insert({ ...parsed.data, org_id: org.id, created_by: user.id });
  if (error?.code === "23505") return DUPLICATE;
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath("/terceros");
  return { ok: true, message: `${parsed.data.name} quedó registrado.` };
}

export async function updateParty(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  if (!idSchema.safeParse(id).success) return { ok: false, message: "Tercero inválido." };
  const parsed = partySchema.safeParse(partyInput(formData));
  if (!parsed.success) return fieldErrors(parsed.error);

  const supabase = await createClient();
  const { data, error } = await supabase.from("parties").update(parsed.data).eq("id", id).select("id");
  if (error?.code === "23505") return DUPLICATE;
  if (error) return { ok: false, message: dbErrorMessage(error) };
  if (!data?.length) return { ok: false, message: "No se pudo guardar: recargá la página." };
  revalidatePath("/terceros");
  return { ok: true, message: "Cambios guardados." };
}

export async function deleteParty(id: string): Promise<FormState> {
  await requireUser();
  if (!idSchema.safeParse(id).success) return { ok: false, message: "Tercero inválido." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("parties").delete().eq("id", id).select("id");
  if (error?.code === "23503") {
    return { ok: false, message: "Es el comitente de una obra: cambialo en la ficha antes de borrarlo." };
  }
  if (error) return { ok: false, message: dbErrorMessage(error) };
  if (!data?.length) return { ok: false, message: "Solo el dueño del estudio borra terceros." };
  revalidatePath("/terceros");
  return { ok: true, message: "Tercero borrado." };
}
