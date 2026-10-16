"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { FieldError, FormMessage, SubmitButton, useActionForm } from "@/components/form";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { formatBytes } from "@/lib/format";
import {
  DISCIPLINE_LABEL,
  DISCIPLINES,
  MAX_REVISION_BYTES,
  REVISION_MIME_TYPES,
  type FormState,
} from "@/lib/validation";
import { createDocument, finishRevisionUpload, prepareRevisionUpload, publishRevision } from "./document-actions";

export function DocumentForm({ projectId }: { projectId: string }) {
  const { state, pending, formProps } = useActionForm(createDocument.bind(null, projectId));
  return (
    <form {...formProps} className="grid gap-3 sm:grid-cols-6">
      <label className="field sm:col-span-2">
        Código
        <input name="code" required maxLength={40} placeholder="A-301" className="input" />
      </label>
      <label className="field sm:col-span-4">
        Título
        <input name="title" required minLength={2} maxLength={160} placeholder="Planta baja" className="input" />
      </label>
      <label className="field sm:col-span-3">
        Disciplina
        <select name="discipline" defaultValue="architecture" className="input">
          {DISCIPLINES.map((d) => (
            <option key={d} value={d}>
              {DISCIPLINE_LABEL[d]}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-col gap-1 sm:col-span-6">
        <FieldError errors={state.errors?.code} />
        <FieldError errors={state.errors?.title} />
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-6">
        <SubmitButton pending={pending} pendingLabel="Creando…">Crear documento</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

const STEP_LABEL = { preparing: "Preparando…", uploading: "Subiendo archivo…", hashing: "Calculando huella…" } as const;
type Step = keyof typeof STEP_LABEL;

// Sube una revisión: crea el registro, sube el archivo directo a Storage con un link firmado
// y después el servidor calcula su SHA-256.
export function RevisionUploadForm({
  projectId,
  documentId,
  suggestedCode,
}: {
  projectId: string;
  documentId: string;
  suggestedCode: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, setState] = useState<FormState>({});
  const [step, setStep] = useState<Step | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setState({ ok: false, errors: { fileName: ["Elegí el archivo"] } });
      return;
    }
    if (file.size > MAX_REVISION_BYTES) {
      setState({ ok: false, errors: { fileSize: ["El archivo pasa los 50 MB"] } });
      return;
    }

    setState({});
    setStep("preparing");
    try {
      const prep = await prepareRevisionUpload(documentId, {
        code: String(data.get("code") ?? ""),
        notes: String(data.get("notes") ?? ""),
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
      });
      if (!prep.ok || !prep.path || !prep.token || !prep.revisionId) {
        setState(prep);
        return;
      }

      setStep("uploading");
      const { error } = await createBrowserSupabase()
        .storage.from("documents")
        .uploadToSignedUrl(prep.path, prep.token, file, { contentType: file.type });
      if (error) {
        setState({ ok: false, message: "No se pudo subir el archivo. Descartá la subida incompleta y probá de nuevo." });
        return;
      }

      setStep("hashing");
      const done = await finishRevisionUpload(projectId, prep.revisionId);
      setState(done);
      if (done.ok) formRef.current?.reset();
    } catch {
      setState({ ok: false, message: "Algo salió mal. Probá de nuevo en un momento." });
    } finally {
      setStep(null);
    }
  }

  return (
    // grid-cols-1: sin eso, el ancho mínimo del selector de archivo estira la columna en el teléfono.
    <form ref={formRef} onSubmit={onSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-6">
      <label className="field sm:col-span-2">
        Revisión
        <input name="code" required maxLength={20} defaultValue={suggestedCode} className="input" />
      </label>
      <label className="field sm:col-span-4">
        Archivo (PDF o imagen, hasta {formatBytes(MAX_REVISION_BYTES)})
        <input name="file" type="file" required accept={REVISION_MIME_TYPES.join(",")} className="input w-full min-w-0" />
      </label>
      <label className="field sm:col-span-6">
        Qué cambió (opcional)
        <input name="notes" maxLength={1000} placeholder="Se corrigió la escalera y la planilla de aberturas" className="input" />
      </label>
      <div className="flex flex-col gap-1 sm:col-span-6">
        <FieldError errors={state.errors?.code} />
        <FieldError errors={state.errors?.fileName} />
        <FieldError errors={state.errors?.fileSize} />
        <FieldError errors={state.errors?.mimeType} />
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-6">
        <SubmitButton pending={step !== null} pendingLabel={step ? STEP_LABEL[step] : undefined}>
          Subir revisión
        </SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function PublishRevisionButton({
  projectId,
  revisionId,
  label,
  replaces,
}: {
  projectId: string;
  revisionId: string;
  label: string;
  replaces: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<FormState>({});
  function publish() {
    const question = replaces
      ? `¿Publicar ${label}? ${replaces} deja de ser la vigente.`
      : `¿Publicar ${label} como la revisión vigente?`;
    if (!window.confirm(question)) return;
    startTransition(async () => setState(await publishRevision(projectId, revisionId)));
  }
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button type="button" onClick={publish} disabled={pending} className="btn btn-primary px-3 py-1 text-xs">
        {pending ? "Publicando…" : "Publicar"}
      </button>
      {state.message && !state.ok && <span className="text-xs text-danger">{state.message}</span>}
    </span>
  );
}
