"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/dal";
import { dbErrorMessage } from "@/lib/errors";
import { documentSchema, fieldErrors, idSchema, revisionUploadSchema, type FormState } from "@/lib/validation";

// Igual que en actions.ts: cada acción verifica la sesión; los permisos los aplica la base.

export async function createDocument(projectId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  if (!idSchema.safeParse(projectId).success) return { ok: false, message: "Proyecto inválido." };
  const parsed = documentSchema.safeParse({
    code: formData.get("code"),
    title: formData.get("title"),
    discipline: formData.get("discipline"),
  });
  if (!parsed.success) return fieldErrors(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_document", {
    p_project_id: projectId,
    p_code: parsed.data.code,
    p_title: parsed.data.title,
    p_discipline: parsed.data.discipline,
  });
  if (error?.code === "23505") return { ok: false, errors: { code: [`Ya hay un documento ${parsed.data.code} en este proyecto`] } };
  if (error) return { ok: false, message: dbErrorMessage(error) };

  revalidatePath(`/proyectos/${projectId}`);
  return { ok: true, message: `Documento ${parsed.data.code} creado. Ahora subí su primera revisión.` };
}

// Subida en tres pasos, porque los planos pasan el límite de tamaño de una Server Action:
// 1) se crea la revisión y un link firmado, 2) el navegador sube el archivo directo a Storage,
// 3) se confirma: el servidor lee el archivo y guarda su SHA-256.
export type PrepareResult = FormState & { revisionId?: string; path?: string; token?: string };

export async function prepareRevisionUpload(
  documentId: string,
  input: { code: string; notes: string; fileName: string; fileSize: number; mimeType: string },
): Promise<PrepareResult> {
  await requireUser();
  if (!idSchema.safeParse(documentId).success) return { ok: false, message: "Documento inválido." };
  const parsed = revisionUploadSchema.safeParse(input);
  if (!parsed.success) return fieldErrors(parsed.error);

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("create_revision", {
      p_document_id: documentId,
      p_code: parsed.data.code,
      p_file_name: parsed.data.fileName,
      p_file_size: parsed.data.fileSize,
      p_mime_type: parsed.data.mimeType,
      p_notes: parsed.data.notes,
    })
    .single<{ id: string; storage_path: string }>();
  if (error?.code === "23505") return { ok: false, errors: { code: [`La revisión ${parsed.data.code} ya existe`] } };
  if (error) return { ok: false, message: dbErrorMessage(error) };

  const { data: signed, error: signError } = await supabase.storage
    .from("documents")
    .createSignedUploadUrl(data.storage_path);
  if (signError || !signed) {
    await supabase.rpc("discard_revision", { p_id: data.id });
    return { ok: false, message: "No pudimos preparar la subida. Probá de nuevo." };
  }
  return { ok: true, revisionId: data.id, path: data.storage_path, token: signed.token };
}

export async function finishRevisionUpload(projectId: string, revisionId: string): Promise<FormState> {
  await requireUser();
  if (!idSchema.safeParse(revisionId).success) return { ok: false, message: "Revisión inválida." };

  const supabase = await createClient();
  const { data: rev } = await supabase
    .from("revisions")
    .select("storage_path, code")
    .eq("id", revisionId)
    .maybeSingle();
  if (!rev) return { ok: false, message: "No encontramos la revisión." };

  // La huella se calcula acá, con el archivo que quedó guardado, no con lo que dice el navegador.
  const { data: file, error: downloadError } = await supabase.storage.from("documents").download(rev.storage_path);
  if (downloadError || !file) return { ok: false, message: "El archivo no llegó a subirse. Probá de nuevo." };
  const sha256 = createHash("sha256").update(Buffer.from(await file.arrayBuffer())).digest("hex");

  const { error } = await supabase.rpc("complete_revision_upload", { p_id: revisionId, p_sha256: sha256 });
  if (error) return { ok: false, message: dbErrorMessage(error) };

  revalidatePath(`/proyectos/${projectId}`);
  return { ok: true, message: `Revisión ${rev.code} subida. Publicala cuando sea la vigente.` };
}

export async function publishRevision(projectId: string, revisionId: string): Promise<FormState> {
  await requireUser();
  if (!idSchema.safeParse(revisionId).success) return { ok: false, message: "Revisión inválida." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("publish_revision", { p_id: revisionId });
  if (error?.code === "22023") return { ok: false, message: "Esta revisión no se puede publicar." };
  if (error) return { ok: false, message: dbErrorMessage(error) };
  revalidatePath(`/proyectos/${projectId}`);
  return { ok: true };
}

export async function discardRevision(projectId: string, revisionId: string): Promise<void> {
  await requireUser();
  if (!idSchema.safeParse(revisionId).success) return;
  const supabase = await createClient();
  await supabase.rpc("discard_revision", { p_id: revisionId });
  revalidatePath(`/proyectos/${projectId}`);
}
