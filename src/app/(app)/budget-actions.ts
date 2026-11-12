"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/dal";
import { dbErrorMessage } from "@/lib/errors";
import { ITEM_LEVELS, budgetItemSchema, chapterNameSchema } from "@/lib/budgets";
import { fieldErrors, idSchema, parseDecimal, type FormState } from "@/lib/validation";

// Cada acción verifica la sesión; los permisos (miembro, borrador) los aplica la base.

const NOT_DRAFT = "El presupuesto ya no está en borrador: no se puede modificar.";

function budgetPath(projectId: string, budgetId: string) {
  return `/proyectos/${projectId}/presupuestos/${budgetId}`;
}

function revalidateBudget(projectId: string, budgetId: string) {
  revalidatePath(budgetPath(projectId, budgetId));
  revalidatePath(`/proyectos/${projectId}/presupuestos`);
  revalidatePath("/obras");
}

function message(error: { code?: string; message?: string }) {
  if (error.code === "22023" && error.message?.includes("borrador")) return NOT_DRAFT;
  if (error.code === "23514" || error.code === "23503") return error.message ?? dbErrorMessage(error);
  return dbErrorMessage(error);
}

export async function createItemBudget(projectId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  if (!idSchema.safeParse(projectId).success) return { ok: false, message: "Proyecto inválido." };
  const level = ITEM_LEVELS.find((l) => l === formData.get("level"));
  if (!level) return { ok: false, errors: { level: ["Elegí el tipo de presupuesto"] } };

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("create_item_budget", {
      p_project_id: projectId,
      p_level: level,
      p_use_template: formData.get("use_template") === "on",
    })
    .single<{ id: string; number: number }>();
  if (error?.code === "22023") return { ok: false, message: error.message };
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidateBudget(projectId, data.id);
  redirect(budgetPath(projectId, data.id));
}

export async function setBudgetExchangeRate(
  projectId: string,
  budgetId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireUser();
  if (!idSchema.safeParse(budgetId).success) return { ok: false, message: "Presupuesto inválido." };
  const raw = String(formData.get("exchange_rate") ?? "").trim();
  const rate = raw === "" ? null : parseDecimal(raw);
  if (rate !== null && (Number.isNaN(rate) || rate <= 0)) {
    return { ok: false, errors: { exchange_rate: ["Indicá cuántos pesos vale un dólar, o dejalo vacío"] } };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_budget_exchange_rate", { p_budget_id: budgetId, p_rate: rate });
  if (error) return { ok: false, message: message(error) };
  revalidateBudget(projectId, budgetId);
  return { ok: true, message: "Tipo de cambio guardado." };
}

// ---------- Rubros ----------

export async function addChapter(projectId: string, budgetId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  if (!idSchema.safeParse(budgetId).success) return { ok: false, message: "Presupuesto inválido." };
  const name = chapterNameSchema.safeParse(formData.get("name"));
  if (!name.success) return { ok: false, errors: { name: [name.error.issues[0].message] } };

  const supabase = await createClient();
  const { data: last } = await supabase
    .from("budget_chapters")
    .select("position")
    .eq("budget_id", budgetId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle<{ position: number }>();
  const { error } = await supabase
    .from("budget_chapters")
    .insert({ budget_id: budgetId, name: name.data, position: (last?.position ?? 0) + 1 });
  if (error?.code === "23505") return { ok: false, errors: { name: ["Ya hay un rubro con ese nombre"] } };
  if (error) return { ok: false, message: message(error) };
  revalidateBudget(projectId, budgetId);
  return { ok: true, message: `Rubro «${name.data}» agregado.` };
}

export async function renameChapter(
  projectId: string,
  budgetId: string,
  chapterId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireUser();
  if (!idSchema.safeParse(chapterId).success) return { ok: false, message: "Rubro inválido." };
  const name = chapterNameSchema.safeParse(formData.get("name"));
  if (!name.success) return { ok: false, errors: { name: [name.error.issues[0].message] } };
  const supabase = await createClient();
  const { error } = await supabase.from("budget_chapters").update({ name: name.data }).eq("id", chapterId);
  if (error?.code === "23505") return { ok: false, errors: { name: ["Ya hay un rubro con ese nombre"] } };
  if (error) return { ok: false, message: message(error) };
  revalidateBudget(projectId, budgetId);
  return { ok: true, message: "Rubro renombrado." };
}

export async function deleteChapter(projectId: string, budgetId: string, chapterId: string): Promise<FormState> {
  await requireUser();
  if (!idSchema.safeParse(chapterId).success) return { ok: false, message: "Rubro inválido." };
  const supabase = await createClient();
  const { error } = await supabase.from("budget_chapters").delete().eq("id", chapterId);
  if (error) return { ok: false, message: message(error) };
  revalidateBudget(projectId, budgetId);
  return { ok: true, message: "Rubro borrado." };
}

export async function moveBudgetRow(
  projectId: string,
  budgetId: string,
  kind: "chapter" | "item",
  id: string,
  direction: -1 | 1,
): Promise<void> {
  await requireUser();
  if (!idSchema.safeParse(id).success || (kind !== "chapter" && kind !== "item")) return;
  const supabase = await createClient();
  await supabase.rpc("move_budget_row", { p_kind: kind, p_id: id, p_direction: direction === -1 ? -1 : 1 });
  revalidateBudget(projectId, budgetId);
}

// ---------- Ítems ----------

export async function saveBudgetItem(
  projectId: string,
  budgetId: string,
  itemId: string | null,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!idSchema.safeParse(budgetId).success) return { ok: false, message: "Presupuesto inválido." };
  if (itemId !== null && !idSchema.safeParse(itemId).success) return { ok: false, message: "Ítem inválido." };
  const parsed = budgetItemSchema.safeParse({
    chapter_id: formData.get("chapter_id"),
    description: formData.get("description"),
    unit: formData.get("unit"),
    quantity: formData.get("quantity"),
    mode: formData.get("mode"),
    analysis_id: formData.get("analysis_id") ?? undefined,
    unit_price: formData.get("unit_price") ?? undefined,
    direct_class: formData.get("direct_class") ?? undefined,
    is_subcontract: formData.get("is_subcontract") ?? undefined,
  });
  if (!parsed.success) return fieldErrors(parsed.error);

  const supabase = await createClient();
  let error;
  if (itemId === null) {
    const { data: last } = await supabase
      .from("budget_items")
      .select("position")
      .eq("chapter_id", parsed.data.chapter_id)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle<{ position: number }>();
    ({ error } = await supabase
      .from("budget_items")
      .insert({ ...parsed.data, budget_id: budgetId, position: (last?.position ?? 0) + 1, created_by: user.id }));
  } else {
    ({ error } = await supabase.from("budget_items").update(parsed.data).eq("id", itemId).eq("budget_id", budgetId));
  }
  if (error) return { ok: false, message: message(error) };
  revalidateBudget(projectId, budgetId);
  return { ok: true, message: itemId ? "Ítem guardado." : `«${parsed.data.description}» agregado.` };
}

export async function deleteBudgetItem(projectId: string, budgetId: string, itemId: string): Promise<FormState> {
  await requireUser();
  if (!idSchema.safeParse(itemId).success) return { ok: false, message: "Ítem inválido." };
  const supabase = await createClient();
  const { error } = await supabase.from("budget_items").delete().eq("id", itemId);
  if (error) return { ok: false, message: message(error) };
  revalidateBudget(projectId, budgetId);
  return { ok: true, message: "Ítem borrado." };
}
