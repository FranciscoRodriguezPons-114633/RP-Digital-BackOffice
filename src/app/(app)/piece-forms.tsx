"use client";

import { useState, useTransition, type FormEvent } from "react";
import { FieldError, FormMessage, SubmitButton, useActionForm } from "@/components/form";
import { useDirectUpload } from "@/components/direct-upload";
import { PIECE_KIND_LABEL, PIECE_KINDS, type FormState } from "@/lib/validation";
import { FileField, UploadFooter } from "./document-forms";
import { createPiece, finishPieceUpload, preparePieceUpload, reviewPiece } from "./piece-actions";
import { closeRound } from "./comment-actions";

export type SourceChoice = { id: string; label: string };

export function PieceForm({
  projectId,
  sources,
  emails,
}: {
  projectId: string;
  sources: SourceChoice[];
  emails: string[];
}) {
  const { state, pending, formProps } = useActionForm(createPiece.bind(null, projectId));
  return (
    <form {...formProps} className="grid grid-cols-1 gap-3 sm:grid-cols-6">
      <label className="field sm:col-span-4">
        Nombre
        <input name="title" required minLength={2} maxLength={160} placeholder="Render fachada norte" className="input" />
      </label>
      <label className="field sm:col-span-2">
        Tipo
        <select name="kind" defaultValue="render" className="input">
          {PIECE_KINDS.map((k) => (
            <option key={k} value={k}>
              {PIECE_KIND_LABEL[k]}
            </option>
          ))}
        </select>
      </label>
      <label className="field sm:col-span-3">
        Hecha sobre
        <select name="source_revision_id" required className="input">
          {sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <label className="field sm:col-span-2">
        Responsable (correo)
        <input name="responsible_email" type="email" list="piece-emails" placeholder="renders@estudio.com" className="input" />
        <datalist id="piece-emails">
          {emails.map((e) => (
            <option key={e} value={e} />
          ))}
        </datalist>
      </label>
      <label className="field sm:col-span-1">
        Rondas
        <input name="rounds_contracted" inputMode="numeric" placeholder="3" className="input" />
      </label>
      <div className="flex flex-col gap-1 sm:col-span-6">
        <FieldError errors={state.errors?.title} />
        <FieldError errors={state.errors?.responsible_email} />
        <FieldError errors={state.errors?.rounds_contracted} />
        <p className="text-xs text-muted">
          Cuando se publique una revisión nueva de ese plano, la pieza pasa a «a revisar» y su responsable recibe un
          aviso. Si el responsable es un invitado (por ejemplo, el renderista), entra y sube la pieza él mismo.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-6">
        <SubmitButton pending={pending} pendingLabel="Creando…">Crear pieza</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function PieceFileForm({ projectId, pieceId }: { projectId: string; pieceId: string }) {
  const { state, step, upload } = useDirectUpload();
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const ok = await upload(
      new FormData(form).get("file"),
      (meta) => preparePieceUpload(pieceId, meta),
      (id) => finishPieceUpload(projectId, id),
    );
    if (ok) form.reset();
  }
  return (
    <form onSubmit={onSubmit} className="grid grid-cols-1 gap-3">
      <FileField />
      <UploadFooter state={state} step={step} label="Subir archivo de la pieza" />
    </form>
  );
}

export function ReviewPieceButtons({ projectId, pieceId, newCode }: { projectId: string; pieceId: string; newCode: string | null }) {
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<FormState>({});
  function decide(decision: "revalidated" | "obsolete") {
    startTransition(async () => setState(await reviewPiece(projectId, pieceId, decision)));
  }
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <span className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => decide("revalidated")}
          className="btn btn-primary btn-sm"
          title={newCode ? `Sigue sirviendo con la ${newCode}` : "Sigue sirviendo"}
        >
          Sigue sirviendo
        </button>
        <button type="button" disabled={pending} onClick={() => decide("obsolete")} className="btn btn-secondary btn-sm">
          Obsoleta
        </button>
      </span>
      {state.message && !state.ok && <span className="text-xs text-danger">{state.message}</span>}
    </span>
  );
}

// Cierra la ronda de correcciones: el responsable recibe los comentarios abiertos y empieza la siguiente.
export function CloseRoundButton({ projectId, pieceId, round }: { projectId: string; pieceId: string; round: number }) {
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<FormState>({});
  function close() {
    if (!window.confirm(`¿Cerrar la ronda ${round} y pedirle los cambios al responsable?`)) return;
    startTransition(async () => setState(await closeRound(projectId, pieceId)));
  }
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <button type="button" disabled={pending} onClick={close} className="btn btn-secondary btn-sm">
        {pending ? "Cerrando…" : `Cerrar ronda ${round} y pedir cambios`}
      </button>
      {state.message && <span className={state.ok ? "text-ok" : "text-danger"}>{state.message}</span>}
    </div>
  );
}
