"use client";

import { FieldError, FormMessage, SubmitButton, useActionForm } from "@/components/form";
import { addComment, resolveComment, type CommentTarget } from "./comment-actions";

export type CommentView = {
  id: string;
  author_email: string;
  body: string;
  page: number | null;
  status: "open" | "resolved";
  created_at: string;
  canResolve: boolean;
};

const dateFmt = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Argentina/Cordoba",
});

// Hilo de comentarios de un archivo (una revisión o una pieza, en su versión exacta).
export function CommentThread({
  projectId,
  target,
  comments,
  isPdf,
}: {
  projectId: string;
  target: CommentTarget;
  comments: CommentView[];
  isPdf: boolean;
}) {
  const open = comments.filter((c) => c.status === "open").length;
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-xs text-muted">
        {comments.length === 0
          ? "Comentar"
          : `Comentarios (${comments.length}${open > 0 ? `, ${open} sin resolver` : ""})`}
      </summary>
      <div className="mt-2 flex flex-col gap-3 border-l-2 border-line pl-3">
        {comments.map((c) => (
          <div key={c.id} className={`flex flex-col gap-0.5 ${c.status === "resolved" ? "opacity-60" : ""}`}>
            <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted">
              <span className="break-all">{c.author_email}</span>
              <span>{dateFmt.format(new Date(c.created_at))}</span>
              {c.page !== null && <span>· pág. {c.page}</span>}
              {c.status === "resolved" ? (
                <span className="text-ok">· resuelto</span>
              ) : (
                c.canResolve && (
                  <form action={resolveComment.bind(null, projectId, c.id)} className="inline">
                    <button type="submit" className="underline">
                      Marcar resuelto
                    </button>
                  </form>
                )
              )}
            </div>
            <p className="whitespace-pre-line">{c.body}</p>
          </div>
        ))}
        <CommentForm projectId={projectId} target={target} isPdf={isPdf} />
      </div>
    </details>
  );
}

function CommentForm({ projectId, target, isPdf }: { projectId: string; target: CommentTarget; isPdf: boolean }) {
  const { state, pending, formProps } = useActionForm(addComment.bind(null, projectId, target));
  return (
    <form {...formProps} className="flex flex-col gap-2">
      <textarea name="body" required rows={2} maxLength={2000} placeholder="Escribí un comentario" className="input" />
      <div className="flex flex-wrap items-center gap-2">
        {isPdf && (
          <label className="flex items-center gap-1 text-xs text-muted">
            Página
            <input name="page" inputMode="numeric" className="input w-16 px-2 py-1" />
          </label>
        )}
        <SubmitButton pending={pending} pendingLabel="Enviando…">Comentar</SubmitButton>
        <FormMessage state={state} />
      </div>
      <FieldError errors={state.errors?.body} />
      <FieldError errors={state.errors?.page} />
    </form>
  );
}
