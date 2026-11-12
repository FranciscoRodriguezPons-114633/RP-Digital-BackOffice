"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrg, requireUser } from "@/lib/dal";
import { dbErrorMessage } from "@/lib/errors";
import { formatMoney } from "@/lib/format";
import {
  ORG_KINDS,
  fieldErrors,
  idSchema,
  parametricBudgetSchema,
  workSchema,
  type FormState,
} from "@/lib/validation";

// Igual que en actions.ts: cada acción verifica la sesión; los permisos los aplica la base.

function revalidateWork(projectId: string) {
  for (const path of ["", "/obra", "/presupuestos"]) revalidatePath(`/proyectos/${projectId}${path}`);
  revalidatePath("/obras");
}

export async function saveWork(projectId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  if (!idSchema.safeParse(projectId).success) return { ok: false, message: "Proyecto inválido." };
  const parsed = workSchema.safeParse({
    org_role: formData.get("org_role"),
    address: formData.get("address") ?? undefined,
    city: formData.get("city") ?? undefined,
    covered_m2: formData.get("covered_m2"),
    semicovered_m2: formData.get("semicovered_m2"),
    typology: formData.get("typology"),
    quality: formData.get("quality"),
    planned_start: formData.get("planned_start") ?? undefined,
    planned_end: formData.get("planned_end") ?? undefined,
    currency: formData.get("currency"),
  });
  if (!parsed.success) return fieldErrors(parsed.error);

  const supabase = await createClient();
  const w = parsed.data;
  const { error } = await supabase.rpc("upsert_work", {
    p_project_id: projectId,
    p_org_role: w.org_role,
    p_address: w.address,
    p_city: w.city,
    p_covered_m2: w.covered_m2,
    p_semicovered_m2: w.semicovered_m2,
    p_typology: w.typology,
    p_quality: w.quality,
    p_planned_start: w.planned_start,
    p_planned_end: w.planned_end,
    p_currency: w.currency,
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidateWork(projectId);
  return { ok: true, message: "Ficha de obra guardada." };
}

export async function createParametricBudget(
  projectId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireUser();
  if (!idSchema.safeParse(projectId).success) return { ok: false, message: "Proyecto inválido." };
  const parsed = parametricBudgetSchema.safeParse({
    reference_cost_m2: formData.get("reference_cost_m2"),
    reference_date: formData.get("reference_date"),
    reference_source: formData.get("reference_source"),
    semicovered_factor: formData.get("semicovered_factor"),
    typology_coef: formData.get("typology_coef"),
    quality_coef: formData.get("quality_coef"),
    notes: formData.get("notes") ?? undefined,
  });
  if (!parsed.success) return fieldErrors(parsed.error);

  const supabase = await createClient();
  const b = parsed.data;
  const { data, error } = await supabase
    .rpc("create_parametric_budget", {
      p_project_id: projectId,
      p_reference_cost_m2: b.reference_cost_m2,
      p_reference_date: b.reference_date,
      p_reference_source: b.reference_source,
      p_semicovered_factor: b.semicovered_factor,
      p_typology_coef: b.typology_coef,
      p_quality_coef: b.quality_coef,
      p_notes: b.notes,
    })
    .single<{ id: string; number: number }>();
  if (error || !data) {
    if (error?.code === "22023" && error.message.includes("ficha")) {
      return { ok: false, message: "Completá la ficha de obra antes de estimar." };
    }
    return { ok: false, message: dbErrorMessage(error) };
  }

  const { data: totals } = await supabase
    .from("budget_totals")
    .select("total, currency")
    .eq("budget_id", data.id)
    .maybeSingle<{ total: string; currency: string }>();
  revalidateWork(projectId);
  return {
    ok: true,
    message: `Listo: versión ${data.number}${totals ? `, ${formatMoney(totals.total, totals.currency)}` : ""}.`,
  };
}

export async function setOrganizationKind(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  const org = await getCurrentOrg();
  if (!org) return { ok: false, message: "Primero creá tu organización." };
  const kind = ORG_KINDS.find((k) => k === formData.get("kind"));
  if (!kind) return { ok: false, errors: { kind: ["Elegí el tipo de organización"] } };

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_organization_kind", { p_org_id: org.id, p_kind: kind });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath("/", "layout");
  return { ok: true, message: "Guardado." };
}
