"use client";

import { useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { MAX_REVISION_BYTES, type FormState } from "@/lib/validation";

type Prepared = FormState & { id?: string; path?: string; token?: string };
type FileMeta = { fileName: string; fileSize: number; mimeType: string };

export const UPLOAD_STEP_LABEL = {
  preparing: "Preparando…",
  uploading: "Subiendo archivo…",
  hashing: "Calculando huella…",
} as const;
export type UploadStep = keyof typeof UPLOAD_STEP_LABEL;

// Subida directa a Storage en tres pasos (los archivos pasan el límite de una Server Action):
// 1) el servidor crea el registro y un link firmado, 2) el navegador sube el archivo,
// 3) el servidor lee lo que quedó guardado y guarda su SHA-256.
export function useDirectUpload() {
  const [state, setState] = useState<FormState>({});
  const [step, setStep] = useState<UploadStep | null>(null);

  async function upload(
    file: unknown,
    prepare: (meta: FileMeta) => Promise<Prepared>,
    finish: (id: string) => Promise<FormState>,
  ): Promise<boolean> {
    if (!(file instanceof File) || file.size === 0) {
      setState({ ok: false, errors: { fileName: ["Elegí el archivo"] } });
      return false;
    }
    if (file.size > MAX_REVISION_BYTES) {
      setState({ ok: false, errors: { fileSize: ["El archivo pasa los 50 MB"] } });
      return false;
    }
    setState({});
    setStep("preparing");
    try {
      const prep = await prepare({ fileName: file.name, fileSize: file.size, mimeType: file.type });
      if (!prep.ok || !prep.id || !prep.path || !prep.token) {
        setState(prep);
        return false;
      }
      setStep("uploading");
      const { error } = await createBrowserSupabase()
        .storage.from("documents")
        .uploadToSignedUrl(prep.path, prep.token, file, { contentType: file.type });
      if (error) {
        setState({ ok: false, message: "No se pudo subir el archivo. Probá de nuevo." });
        return false;
      }
      setStep("hashing");
      const done = await finish(prep.id);
      setState(done);
      return Boolean(done.ok);
    } catch {
      setState({ ok: false, message: "Algo salió mal. Probá de nuevo en un momento." });
      return false;
    } finally {
      setStep(null);
    }
  }

  return { state, step, upload };
}
