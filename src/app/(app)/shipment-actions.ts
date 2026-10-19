"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/dal";
import { dbErrorMessage } from "@/lib/errors";
import { fieldErrors, idSchema, shipmentSchema, type FormState } from "@/lib/validation";

// Registra un envío de revisiones o piezas a un invitado. La base guarda la huella de cada
// archivo y, si el canal es correo, le avisa al invitado.
export async function sendShipment(projectId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  if (!idSchema.safeParse(projectId).success) return { ok: false, message: "Proyecto inválido." };
  const parsed = shipmentSchema.safeParse({
    recipient_email: formData.get("recipient_email"),
    channel: formData.get("channel"),
    note: formData.get("note") ?? undefined,
    revision_ids: formData.getAll("revision_ids"),
    dependency_ids: formData.getAll("dependency_ids"),
  });
  if (!parsed.success) return fieldErrors(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase.rpc("send_shipment", {
    p_project_id: projectId,
    p_recipient_email: parsed.data.recipient_email,
    p_revision_ids: parsed.data.revision_ids,
    p_dependency_ids: parsed.data.dependency_ids,
    p_channel: parsed.data.channel,
    p_note: parsed.data.note,
  });
  if (error?.code === "23514") return { ok: false, errors: { recipient_email: ["Primero invitá a esa persona al proyecto"] } };
  if (error?.code === "22023") return { ok: false, message: "Algún archivo ya no está disponible. Recargá la página." };
  if (error) return { ok: false, message: dbErrorMessage(error) };

  revalidatePath(`/proyectos/${projectId}`);
  const n = parsed.data.revision_ids.length + parsed.data.dependency_ids.length;
  return { ok: true, message: `Envío registrado: ${n === 1 ? "1 archivo" : `${n} archivos`} a ${parsed.data.recipient_email}.` };
}
