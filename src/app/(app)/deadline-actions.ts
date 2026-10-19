"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrg, requireUser } from "@/lib/dal";
import { dbErrorMessage } from "@/lib/errors";
import { deadlineSchema, fieldErrors, idSchema, type FormState } from "@/lib/validation";

function revalidateDeadlines(projectId: string | null) {
  revalidatePath("/vencimientos");
  if (projectId) revalidatePath(`/proyectos/${projectId}`);
}

export async function createDeadline(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  const org = await getCurrentOrg();
  if (!org) return { ok: false, message: "Primero creá tu estudio." };
  const parsed = deadlineSchema.safeParse({
    project_id: formData.get("project_id") ?? undefined,
    title: formData.get("title"),
    due_date: formData.get("due_date"),
    notify_days: formData.get("notify_days") || "30, 15, 5",
    notes: formData.get("notes") ?? undefined,
  });
  if (!parsed.success) return fieldErrors(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_deadline", {
    p_org_id: org.id,
    p_project_id: parsed.data.project_id,
    p_title: parsed.data.title,
    p_due_date: parsed.data.due_date,
    p_notify_days: parsed.data.notify_days,
    p_notes: parsed.data.notes,
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidateDeadlines(parsed.data.project_id);
  return { ok: true, message: `Listo: te avisamos ${parsed.data.notify_days.join(", ")} días antes.` };
}

export async function setDeadlineDone(projectId: string | null, deadlineId: string, done: boolean): Promise<void> {
  await requireUser();
  if (!idSchema.safeParse(deadlineId).success) return;
  const supabase = await createClient();
  await supabase.rpc("set_deadline_done", { p_id: deadlineId, p_done: done });
  revalidateDeadlines(projectId);
}
