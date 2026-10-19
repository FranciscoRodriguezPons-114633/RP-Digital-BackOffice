import "server-only";
import { createHash } from "node:crypto";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export const FILES_BUCKET = "documents";

// Link firmado para que el navegador suba el archivo directo a Storage.
export async function signUpload(supabase: Supabase, path: string) {
  const { data, error } = await supabase.storage.from(FILES_BUCKET).createSignedUploadUrl(path);
  return error || !data ? null : data.token;
}

// La huella se calcula con el archivo que quedó guardado, no con lo que dice el navegador.
export async function hashStoredFile(supabase: Supabase, path: string) {
  const { data, error } = await supabase.storage.from(FILES_BUCKET).download(path);
  if (error || !data) return null;
  return createHash("sha256").update(Buffer.from(await data.arrayBuffer())).digest("hex");
}
