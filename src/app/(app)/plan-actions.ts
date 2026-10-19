"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrg, requireUser } from "@/lib/dal";
import { dbErrorMessage } from "@/lib/errors";
import { billingRequestSchema, fieldErrors, idSchema, type FormState } from "@/lib/validation";

export async function requestPaidPlan(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  const org = await getCurrentOrg();
  if (!org || org.role !== "owner") return { ok: false, message: "Solo el dueño del estudio pide el pase a pago." };
  const parsed = billingRequestSchema.safeParse({
    plan: formData.get("plan"),
    billing_cycle: formData.get("billing_cycle"),
    billing_name: formData.get("billing_name"),
    tax_id: formData.get("tax_id"),
    billing_email: formData.get("billing_email"),
  });
  if (!parsed.success) return fieldErrors(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase.rpc("request_paid_plan", {
    p_org_id: org.id,
    p_plan: parsed.data.plan,
    p_billing_cycle: parsed.data.billing_cycle,
    p_billing_name: parsed.data.billing_name,
    p_tax_id: parsed.data.tax_id,
    p_billing_email: parsed.data.billing_email,
  });
  if (error?.code === "23505") return { ok: false, message: "Ya hay un pedido pendiente: te escribimos en breve." };
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath("/plan");
  return { ok: true, message: `Listo. Te mandamos los datos para la transferencia y la factura a ${parsed.data.billing_email}.` };
}

// Panel de la plataforma: confirmar el pago (con hasta cuándo) o rechazar el pedido.
export async function decideBillingRequest(requestId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  if (!idSchema.safeParse(requestId).success) return { ok: false, message: "Pedido inválido." };
  const approve = formData.get("decision") === "approve";
  const paidUntil = String(formData.get("paid_until") ?? "");
  if (approve && !/^\d{4}-\d{2}-\d{2}$/.test(paidUntil)) return { ok: false, errors: { paid_until: ["Elegí hasta cuándo está pago"] } };

  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_billing_request", {
    p_id: requestId,
    p_approve: approve,
    p_paid_until: approve ? paidUntil : null,
    p_note: String(formData.get("note") ?? "") || null,
  });
  if (error?.code === "23514") return { ok: false, errors: { paid_until: ["La fecha tiene que ser futura"] } };
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath("/admin/cobros");
  return { ok: true, message: approve ? "Pago confirmado: el estudio ya está en su plan." : "Pedido rechazado." };
}
