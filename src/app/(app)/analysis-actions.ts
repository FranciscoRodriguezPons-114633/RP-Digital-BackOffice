"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrg, requireUser } from "@/lib/dal";
import { dbErrorMessage } from "@/lib/errors";
import { componentsSchema, unitAnalysisSchema } from "@/lib/analyses";
import type { SupplyKind } from "@/lib/supplies";
import { fieldErrors, idSchema, type FormState } from "@/lib/validation";

function analysisInput(formData: FormData) {
  return {
    code: formData.get("code"),
    name: formData.get("name"),
    unit: formData.get("unit"),
    chapter: formData.get("chapter"),
    default_waste_pct: formData.get("default_waste_pct"),
    notes: formData.get("notes") ?? undefined,
  };
}

function revalidateAnalysis(id?: string) {
  revalidatePath("/analisis-de-precios");
  if (id) revalidatePath(`/analisis-de-precios/${id}`);
}

// Crea el análisis y lleva al editor para cargarle los componentes.
export async function createUnitAnalysis(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const org = await getCurrentOrg();
  if (!org) return { ok: false, message: "Primero creá tu organización." };
  const parsed = unitAnalysisSchema.safeParse(analysisInput(formData));
  if (!parsed.success) return fieldErrors(parsed.error);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("unit_analyses")
    .insert({ ...parsed.data, org_id: org.id, created_by: user.id })
    .select("id")
    .single<{ id: string }>();
  if (error?.code === "23505") return { ok: false, errors: { code: [`Ya hay un análisis con el código ${parsed.data.code}`] } };
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidateAnalysis();
  redirect(`/analisis-de-precios/${data.id}`);
}

export async function updateUnitAnalysis(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  if (!idSchema.safeParse(id).success) return { ok: false, message: "Análisis inválido." };
  const parsed = unitAnalysisSchema.safeParse(analysisInput(formData));
  if (!parsed.success) return fieldErrors(parsed.error);

  const supabase = await createClient();
  const { data, error } = await supabase.from("unit_analyses").update(parsed.data).eq("id", id).select("id");
  if (error?.code === "23505") return { ok: false, errors: { code: [`Ya hay un análisis con el código ${parsed.data.code}`] } };
  if (error) return { ok: false, message: dbErrorMessage(error) };
  if (!data?.length) return { ok: false, message: "No se pudo guardar: recargá la página." };
  revalidateAnalysis(id);
  return { ok: true, message: "Cambios guardados." };
}

export async function deleteUnitAnalysis(id: string): Promise<FormState> {
  await requireUser();
  if (!idSchema.safeParse(id).success) return { ok: false, message: "Análisis inválido." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("unit_analyses").delete().eq("id", id).select("id");
  if (error?.code === "23503") return { ok: false, message: "Lo usa un presupuesto: no se puede borrar." };
  if (error) return { ok: false, message: dbErrorMessage(error) };
  if (!data?.length) return { ok: false, message: "Solo el dueño borra análisis de precios." };
  revalidateAnalysis();
  redirect("/analisis-de-precios");
}

// Guarda la lista completa de componentes del editor (en el orden en que se ven).
export async function saveComponents(analysisId: string, rows: unknown): Promise<FormState> {
  await requireUser();
  if (!idSchema.safeParse(analysisId).success) return { ok: false, message: "Análisis inválido." };
  const parsed = componentsSchema.safeParse(rows);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_unit_analysis_components", {
    p_analysis_id: analysisId,
    p_rows: parsed.data,
  });
  if (error?.code === "23514") return { ok: false, message: error.message };
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidateAnalysis(analysisId);
  return { ok: true, message: "Componentes guardados." };
}

export type SupplyHit = {
  id: string;
  code: string;
  name: string;
  kind: SupplyKind;
  unit: string;
  currency: string;
  price: string | null;
};

// Búsqueda de insumos para sumar al análisis: devuelve pocos resultados, no toda la biblioteca.
export async function searchSupplies(term: string): Promise<SupplyHit[]> {
  await requireUser();
  const org = await getCurrentOrg();
  if (!org) return [];
  const q = String(term ?? "").replace(/[,()%*\\"]/g, " ").trim().slice(0, 60);
  const supabase = await createClient();
  let query = supabase
    .from("supplies")
    .select("id, code, name, kind, unit, currency, price")
    .eq("org_id", org.id)
    .eq("active", true)
    .neq("kind", "staff")
    .order("code")
    .limit(20);
  if (q) query = query.or(`code.ilike.%${q}%,name.ilike.%${q}%`);
  const { data } = await query;
  return (data ?? []) as SupplyHit[];
}

export async function importCatalogAnalyses(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  const org = await getCurrentOrg();
  if (!org) return { ok: false, message: "Primero creá tu organización." };
  if (org.role !== "owner") return { ok: false, message: "Solo el dueño importa del catálogo." };
  const codes = formData
    .getAll("codes")
    .map(String)
    .filter((c) => /^[A-Z0-9][A-Z0-9._/-]{0,39}$/.test(c))
    .slice(0, 200);
  if (codes.length === 0) return { ok: false, message: "Marcá al menos un análisis del catálogo." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("import_catalog_analyses", { p_org_id: org.id, p_codes: codes });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  const r = data as { imported: number; skipped: number; supplies_created: number };
  revalidateAnalysis();
  revalidatePath("/insumos");
  const parts = [`${r.imported} ${r.imported === 1 ? "análisis importado" : "análisis importados"}`];
  if (r.supplies_created > 0) {
    parts.push(
      `${r.supplies_created} ${r.supplies_created === 1 ? "insumo nuevo quedó sin precio" : "insumos nuevos quedaron sin precio"}: cargales el precio en Insumos`,
    );
  }
  if (r.skipped > 0) parts.push(`${r.skipped} ya ${r.skipped === 1 ? "estaba" : "estaban"}`);
  return { ok: true, message: `Listo: ${parts.join("; ")}.` };
}
