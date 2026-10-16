"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { dbErrorMessage } from "@/lib/errors";
import { decisionSchema, fieldErrors, isApprovalToken, type FormState } from "@/lib/validation";

// Sin sesión: la función de la base valida el token, que no haya vencido ni se haya usado,
// y que la orden siga siendo la que se envió.
export async function decideChangeOrder(token: string, _prev: FormState, formData: FormData): Promise<FormState> {
  if (!isApprovalToken(token)) return { ok: false, message: "Este link no es válido." };
  const parsed = decisionSchema.safeParse({
    decision: formData.get("decision"),
    signer_name: formData.get("signer_name"),
    comment: formData.get("comment") ?? undefined,
  });
  if (!parsed.success) return fieldErrors(parsed.error);

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;

  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_change_order", {
    p_token: token,
    p_decision: parsed.data.decision,
    p_signer_name: parsed.data.signer_name,
    p_comment: parsed.data.comment,
    p_ip: ip,
    p_user_agent: h.get("user-agent"),
  });

  revalidatePath(`/aprobar/${token}`);
  if (error?.code === "22023") {
    return { ok: false, message: "Este link ya no es válido. Recargá la página para ver qué pasó." };
  }
  if (error) return { ok: false, message: dbErrorMessage(error) };
  return { ok: true, message: parsed.data.decision === "approved" ? "Listo: aprobaste la orden." : "Listo: rechazaste la orden." };
}
