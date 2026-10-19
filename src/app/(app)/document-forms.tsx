"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { FieldError, FormMessage, SubmitButton, useActionForm } from "@/components/form";
import { UPLOAD_STEP_LABEL, useDirectUpload, type UploadStep } from "@/components/direct-upload";
import { formatBytes } from "@/lib/format";
import {
  DISCIPLINE_LABEL,
  DISCIPLINES,
  MAX_REVISION_BYTES,
  REVISION_MIME_TYPES,
  type FormState,
} from "@/lib/validation";
import { createDocument, finishRevisionUpload, prepareBulkUpload, prepareRevisionUpload, publishRevision } from "./document-actions";

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
  const { state, step, upload } = useDirectUpload();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const ok = await upload(
      data.get("file"),
      (meta) =>
        prepareRevisionUpload(documentId, {
          ...meta,
          code: String(data.get("code") ?? ""),
          notes: String(data.get("notes") ?? ""),
        }),
      (id) => finishRevisionUpload(projectId, id),
    );
    if (ok) formRef.current?.reset();
  }

  return (
    // grid-cols-1: sin eso, el ancho mínimo del selector de archivo estira la columna en el teléfono.
    <form ref={formRef} onSubmit={onSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-6">
      <label className="field sm:col-span-2">
        Revisión
        <input name="code" required maxLength={20} defaultValue={suggestedCode} className="input" />
      </label>
      <FileField className="sm:col-span-4" />
      <label className="field sm:col-span-6">
        Qué cambió (opcional)
        <input name="notes" maxLength={1000} placeholder="Se corrigió la escalera y la planilla de aberturas" className="input" />
      </label>
      <UploadFooter state={state} step={step} label="Subir revisión" className="sm:col-span-6" />
    </form>
  );
}

export function FileField({ className = "" }: { className?: string }) {
  return (
    <label className={`field ${className}`}>
      Archivo (PDF o imagen, hasta {formatBytes(MAX_REVISION_BYTES)})
      <input name="file" type="file" required accept={REVISION_MIME_TYPES.join(",")} className="input w-full min-w-0" />
    </label>
  );
}

export function UploadFooter({
  state,
  step,
  label,
  className = "",
}: {
  state: FormState;
  step: UploadStep | null;
  label: string;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <FieldError errors={state.errors?.code} />
      <FieldError errors={state.errors?.fileName} />
      <FieldError errors={state.errors?.fileSize} />
      <FieldError errors={state.errors?.mimeType} />
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pending={step !== null} pendingLabel={step ? UPLOAD_STEP_LABEL[step] : undefined}>
          {label}
        </SubmitButton>
        <FormMessage state={state} />
      </div>
    </div>
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

type BulkResult = { name: string; label?: string; ok: boolean; message: string };

// Carga masiva: varios planos de una vez. El nombre del archivo dice a qué documento va
// ("A-101 Planta baja.pdf"); si el documento no existe, se crea, y el archivo entra como
// su próxima revisión. Opcionalmente quedan publicados como vigentes.
export function BulkUploadForm({ projectId }: { projectId: string }) {
  const { step, upload } = useDirectUpload();
  const [results, setResults] = useState<BulkResult[]>([]);
  const [current, setCurrent] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const files = data.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
    const publish = data.get("publish") === "on";
    setResults([]);
    for (const file of files) {
      setCurrent(file.name);
      let label: string | undefined;
      const ok = await upload(
        file,
        async (meta) => {
          const prep = await prepareBulkUpload(projectId, meta);
          label = prep.label;
          return prep;
        },
        async (id) => {
          const done = await finishRevisionUpload(projectId, id);
          if (done.ok && publish) {
            const published = await publishRevision(projectId, id);
            if (!published.ok) return published;
          }
          return done;
        },
      );
      setResults((r) => [
        ...r,
        { name: file.name, label, ok, message: ok ? (publish ? "subida y publicada" : "subida") : "no se pudo subir" },
      ]);
    }
    setCurrent(null);
    form.reset();
  }

  const busy = current !== null;
  return (
    <form onSubmit={onSubmit} className="grid grid-cols-1 gap-3">
      <label className="field">
        Planos (PDF o imágenes, hasta {formatBytes(MAX_REVISION_BYTES)} cada uno)
        <input name="files" type="file" multiple required accept={REVISION_MIME_TYPES.join(",")} className="input w-full min-w-0" />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="publish" defaultChecked className="size-4 accent-[var(--accent)]" />
        Publicarlos como la revisión vigente
      </label>
      <p className="text-xs text-muted">
        El nombre de cada archivo indica el documento: «A-101 Planta baja.pdf» va al A-101 (si no existe, se crea con
        ese título) como su próxima revisión.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pending={busy} pendingLabel={current ? `${step ? UPLOAD_STEP_LABEL[step] : "…"} ${current}` : undefined}>
          Cargar planos
        </SubmitButton>
      </div>
      {results.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm">
          {results.map((r) => (
            <li key={r.name} className={r.ok ? "text-ok" : "text-danger"}>
              {r.label ?? r.name}: {r.message}
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
