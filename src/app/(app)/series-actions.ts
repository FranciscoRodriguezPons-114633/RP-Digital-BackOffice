"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrg, requireUser } from "@/lib/dal";
import { dbErrorMessage } from "@/lib/errors";
import { parseSeriesPaste } from "@/lib/series";
import {
  adoptSeriesSchema,
  exchangeRateSchema,
  fieldErrors,
  idSchema,
  seriesCodeSchema,
  type FormState,
} from "@/lib/validation";

// ---------- Plataforma: carga de valores ----------

export async function loadReferenceValues(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  const series = seriesCodeSchema.safeParse(formData.get("series_code"));
  if (!series.success) return { ok: false, errors: { series_code: ["Elegí una serie"] } };

  // Se vuelve a leer el texto pegado acá: lo que vale es esto, no la vista previa del navegador.
  const { rows, errors } = parseSeriesPaste(String(formData.get("text") ?? ""));
  if (errors.length > 0) {
    const first = errors[0];
    return {
      ok: false,
      errors: { text: [first.line ? `Fila ${first.line}: ${first.message}` : first.message] },
    };
  }
  if (rows.length === 0) return { ok: false, errors: { text: ["Pegá al menos un mes con su valor"] } };

  const allProvisional = formData.get("provisional") === "on";
  const note = String(formData.get("note") ?? "").trim().slice(0, 500) || null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("load_reference_values", {
      p_series: series.data,
      p_rows: rows.map((r) => ({
        period: r.period,
        value: r.value,
        provisional: allProvisional || r.provisional,
        note,
      })),
    })
    .single<{ inserted: number; rectified: number; unchanged: number }>();
  if (error?.code === "22023") return { ok: false, message: error.message };
  if (error) return { ok: false, message: dbErrorMessage(error) };

  revalidatePath("/admin/series");
  revalidatePath("/indices");
  const parts = [
    `${data.inserted} ${data.inserted === 1 ? "mes nuevo" : "meses nuevos"}`,
    `${data.rectified} ${data.rectified === 1 ? "rectificado" : "rectificados"}`,
    `${data.unchanged} sin cambios`,
  ];
  return { ok: true, message: `Listo: ${parts.join(", ")}. Los estudios que la adoptaron ya lo ven.` };
}

// ---------- Estudio: adoptar una serie ----------

export async function adoptReferenceSeries(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  const org = await getCurrentOrg();
  if (!org) return { ok: false, message: "Primero creá tu estudio." };
  const parsed = adoptSeriesSchema.safeParse({
    series_code: formData.get("series_code"),
    local_name: formData.get("local_name"),
    replace: formData.get("replace") ?? undefined,
  });
  if (!parsed.success) return fieldErrors(parsed.error);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("adopt_reference_series", {
    p_org_id: org.id,
    p_series: parsed.data.series_code,
    p_local_name: parsed.data.local_name,
    p_replace: parsed.data.replace,
  });
  if (error?.code === "23505") {
    return {
      ok: false,
      errors: {
        local_name: [
          error.message.includes("a mano")
            ? "Ya cargaste a mano un índice con ese nombre: marcá «Reemplazar» o elegí otro nombre"
            : error.message,
        ],
      },
    };
  }
  if (error) return { ok: false, message: dbErrorMessage(error) };

  revalidatePath("/indices");
  const copied = Number(data ?? 0);
  return {
    ok: true,
    message:
      copied === 0
        ? `Adoptaste ${parsed.data.local_name}. Cuando la plataforma cargue valores, te llegan solos.`
        : `Adoptaste ${parsed.data.local_name} con ${copied} ${copied === 1 ? "mes" : "meses"}. Los valores nuevos te llegan solos.`,
  };
}

// ---------- Estudio: tipo de cambio ----------

export async function saveExchangeRate(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const org = await getCurrentOrg();
  if (!org) return { ok: false, message: "Primero creá tu estudio." };
  const parsed = exchangeRateSchema.safeParse({
    rate_date: formData.get("rate_date"),
    source: formData.get("source"),
    rate: formData.get("rate"),
  });
  if (!parsed.success) return fieldErrors(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase
    .from("exchange_rates")
    .insert({ ...parsed.data, currency: "USD", org_id: org.id, created_by: user.id });
  if (error?.code === "23505") {
    // Mismo día y fuente: se corrige la cotización.
    const { data, error: updateError } = await supabase
      .from("exchange_rates")
      .update({ rate: parsed.data.rate })
      .eq("org_id", org.id)
      .eq("currency", "USD")
      .eq("rate_date", parsed.data.rate_date)
      .eq("source", parsed.data.source)
      .select("id");
    if (updateError) return { ok: false, message: dbErrorMessage(updateError) };
    if (!data?.length) return { ok: false, message: "Solo el dueño del estudio carga el tipo de cambio." };
    revalidatePath("/indices");
    return { ok: true, message: "Cotización corregida." };
  }
  if (error?.code === "42501") return { ok: false, message: "Solo el dueño del estudio carga el tipo de cambio." };
  if (error) return { ok: false, message: dbErrorMessage(error) };

  revalidatePath("/indices");
  return { ok: true, message: "Cotización guardada." };
}

export async function deleteExchangeRate(id: string): Promise<void> {
  await requireUser();
  if (!idSchema.safeParse(id).success) return;
  const supabase = await createClient();
  await supabase.from("exchange_rates").delete().eq("id", id);
  revalidatePath("/indices");
}
