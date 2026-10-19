"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/dal";
import { dbErrorMessage } from "@/lib/errors";
import { commentSchema, fieldErrors, idSchema, type FormState } from "@/lib/validation";

export type CommentTarget = { revisionId: string | null; dependencyId: string | null };

// Comentan el estudio y los invitados que ven el archivo; la base lo valida.
export async function addComment(
  projectId: string,
  target: CommentTarget,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireUser();
  const ids = [target.revisionId, target.dependencyId].filter(Boolean);
  if (!idSchema.safeParse(projectId).success || ids.length !== 1 || !idSchema.safeParse(ids[0]).success) {
    return { ok: false, message: "Archivo inválido." };
  }
  const x = formData.get("anchor_x");
  const y = formData.get("anchor_y");
  const parsed = commentSchema.safeParse({
    body: formData.get("body"),
    page: formData.get("page") ?? undefined,
    anchor: x && y ? { x, y } : null,
  });
  if (!parsed.success) return fieldErrors(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase.rpc("add_comment", {
    p_revision_id: target.revisionId,
    p_dependency_id: target.dependencyId,
    p_body: parsed.data.body,
    p_page: parsed.data.page,
    p_anchor: parsed.data.anchor,
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath(`/proyectos/${projectId}`);
  return { ok: true };
}

export async function resolveComment(projectId: string, commentId: string): Promise<void> {
  await requireUser();
  if (!idSchema.safeParse(commentId).success) return;
  const supabase = await createClient();
  await supabase.rpc("resolve_comment", { p_id: commentId });
  revalidatePath(`/proyectos/${projectId}`);
}

export async function closeRound(projectId: string, pieceId: string): Promise<FormState> {
  await requireUser();
  if (!idSchema.safeParse(pieceId).success) return { ok: false, message: "Pieza inválida." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("close_round", { p_dependency_id: pieceId });
  if (error?.code === "22023") return { ok: false, message: "La ronda no tiene comentarios sin resolver." };
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath(`/proyectos/${projectId}`);
  return { ok: true, message: `Ronda cerrada: le avisamos al responsable. Ahora corre la ronda ${String(data)}.` };
}
