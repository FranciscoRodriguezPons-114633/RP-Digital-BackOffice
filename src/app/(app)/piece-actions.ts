"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/dal";
import { dbErrorMessage } from "@/lib/errors";
import { hashStoredFile, signUpload } from "@/lib/storage";
import {
  fieldErrors,
  fileMetaSchema,
  idSchema,
  pieceDecisionSchema,
  pieceSchema,
  type FormState,
} from "@/lib/validation";
import type { PrepareResult } from "./document-actions";

// Piezas dependientes (renders, planos de venta, brochures). Los permisos los aplica la base:
// el estudio las crea y decide; el responsable (puede ser un renderista invitado) sube el archivo.

function revalidatePieces(projectId: string) {
  revalidatePath(`/proyectos/${projectId}`);
  revalidatePath("/a-revisar");
}

export async function createPiece(projectId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  if (!idSchema.safeParse(projectId).success) return { ok: false, message: "Proyecto inválido." };
  const parsed = pieceSchema.safeParse({
    source_revision_id: formData.get("source_revision_id"),
    kind: formData.get("kind"),
    title: formData.get("title"),
    responsible_email: formData.get("responsible_email") ?? undefined,
    rounds_contracted: formData.get("rounds_contracted") ?? undefined,
  });
  if (!parsed.success) return fieldErrors(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_dependency", {
    p_source_revision_id: parsed.data.source_revision_id,
    p_kind: parsed.data.kind,
    p_title: parsed.data.title,
    p_responsible_email: parsed.data.responsible_email,
    p_rounds_contracted: parsed.data.rounds_contracted,
  });
  if (error?.code === "22023") return { ok: false, message: "La revisión de origen ya no es la vigente." };
  if (error) return { ok: false, message: dbErrorMessage(error) };

  revalidatePieces(projectId);
  return { ok: true, message: `Pieza «${parsed.data.title}» creada. Subí su archivo cuando esté.` };
}

export async function preparePieceUpload(
  pieceId: string,
  input: { fileName: string; fileSize: number; mimeType: string },
): Promise<PrepareResult> {
  await requireUser();
  if (!idSchema.safeParse(pieceId).success) return { ok: false, message: "Pieza inválida." };
  const parsed = fileMetaSchema.safeParse(input);
  if (!parsed.success) return fieldErrors(parsed.error);

  const supabase = await createClient();
  const { data: path, error } = await supabase.rpc("attach_dependency_file", {
    p_id: pieceId,
    p_file_name: parsed.data.fileName,
    p_file_size: parsed.data.fileSize,
    p_mime_type: parsed.data.mimeType,
  });
  if (error?.code === "22023") return { ok: false, message: "La pieza ya tiene su archivo." };
  if (error || typeof path !== "string") return { ok: false, message: dbErrorMessage(error) };

  const token = await signUpload(supabase, path);
  if (!token) return { ok: false, message: "No pudimos preparar la subida. Probá de nuevo." };
  return { ok: true, id: pieceId, path, token };
}

export async function finishPieceUpload(projectId: string, pieceId: string): Promise<FormState> {
  await requireUser();
  if (!idSchema.safeParse(pieceId).success) return { ok: false, message: "Pieza inválida." };
  const supabase = await createClient();
  const { data: piece } = await supabase.from("dependencies").select("storage_path").eq("id", pieceId).maybeSingle();
  if (!piece?.storage_path) return { ok: false, message: "No encontramos la pieza." };

  const sha256 = await hashStoredFile(supabase, piece.storage_path);
  if (!sha256) return { ok: false, message: "El archivo no llegó a subirse. Probá de nuevo." };
  const { error } = await supabase.rpc("complete_dependency_upload", { p_id: pieceId, p_sha256: sha256 });
  if (error) return { ok: false, message: dbErrorMessage(error) };

  revalidatePieces(projectId);
  return { ok: true, message: "Archivo de la pieza subido." };
}

export async function reviewPiece(projectId: string, pieceId: string, decision: string): Promise<FormState> {
  await requireUser();
  const parsed = pieceDecisionSchema.safeParse(decision);
  if (!idSchema.safeParse(pieceId).success || !parsed.success) return { ok: false, message: "Pedido inválido." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("review_dependency", { p_id: pieceId, p_decision: parsed.data });
  if (error?.code === "22023") return { ok: false, message: "Esta pieza ya no está a revisar." };
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePieces(projectId);
  return { ok: true };
}
