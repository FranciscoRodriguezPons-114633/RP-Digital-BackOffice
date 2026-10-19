"use client";

import { useState, type MouseEvent } from "react";
import { FieldError, FormMessage, SubmitButton, useActionForm } from "@/components/form";
import type { FormState } from "@/lib/validation";
import { addComment, resolveComment, type CommentTarget } from "./comment-actions";

export type CommentView = {
  id: string;
  author_email: string;
  body: string;
  page: number | null;
  anchor: { x: number; y: number } | null;
  round: number | null;
  status: "open" | "resolved";
  created_at: string;
  canResolve: boolean;
};

type Point = { x: number; y: number };

const dateFmt = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Argentina/Cordoba",
});

// Hilo de comentarios de un archivo (una revisión o una pieza, en su versión exacta).
// En una imagen, se toca el punto a comentar y el comentario queda con su pin numerado.
export function CommentThread({
  projectId,
  target,
  comments,
  isPdf,
  imageUrl,
}: {
  projectId: string;
  target: CommentTarget;
  comments: CommentView[];
  isPdf: boolean;
  imageUrl?: string;
}) {
  const [point, setPoint] = useState<Point | null>(null);
  const open = comments.filter((c) => c.status === "open").length;
  const pinned = comments.filter((c) => c.anchor);
  const pinNumber = new Map(pinned.map((c, i) => [c.id, i + 1]));

  function pick(event: MouseEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    setPoint({
      x: Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)),
      y: Math.min(1, Math.max(0, (event.clientY - box.top) / box.height)),
    });
  }

  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-xs text-muted">
        {comments.length === 0
          ? "Comentar"
          : `Comentarios (${comments.length}${open > 0 ? `, ${open} sin resolver` : ""})`}
      </summary>
      <div className="mt-2 flex flex-col gap-3 border-l-2 border-line pl-3">
        {imageUrl && (
          <div className="flex flex-col gap-1">
            {/* La imagen viene de un link firmado de Storage: no pasa por el optimizador de Next. */}
            <div className="relative max-w-xl cursor-crosshair select-none" onClick={pick}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl} alt="Archivo a comentar" className="block w-full rounded-md border border-line" />
              {pinned.map((c) => (
                <Pin key={c.id} point={c.anchor!} label={String(pinNumber.get(c.id))} muted={c.status === "resolved"} />
              ))}
              {point && <Pin point={point} label="+" active />}
            </div>
            <p className="text-xs text-muted">
              {point ? "Escribí el comentario para ese punto." : "Tocá la imagen para marcar el punto que querés comentar."}
            </p>
          </div>
        )}
        {comments.map((c) => (
          <div key={c.id} className={`flex flex-col gap-0.5 ${c.status === "resolved" ? "opacity-60" : ""}`}>
            <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted">
              {pinNumber.has(c.id) && (
                <span className="rounded-full bg-accent px-1.5 font-medium text-surface">{pinNumber.get(c.id)}</span>
              )}
              <span className="break-all">{c.author_email}</span>
              <span>{dateFmt.format(new Date(c.created_at))}</span>
              {c.page !== null && <span>· pág. {c.page}</span>}
              {c.round !== null && <span>· ronda {c.round}</span>}
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
        <CommentForm projectId={projectId} target={target} isPdf={isPdf} point={point} onSent={() => setPoint(null)} />
      </div>
    </details>
  );
}

function Pin({ point, label, muted = false, active = false }: { point: Point; label: string; muted?: boolean; active?: boolean }) {
  return (
    <span
      className={`pointer-events-none absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-surface text-xs font-semibold shadow ${
        active ? "bg-warn text-surface" : muted ? "bg-line text-muted" : "bg-accent text-surface"
      }`}
      style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
    >
      {label}
    </span>
  );
}

function CommentForm({
  projectId,
  target,
  isPdf,
  point,
  onSent,
}: {
  projectId: string;
  target: CommentTarget;
  isPdf: boolean;
  point: Point | null;
  onSent: () => void;
}) {
  const { state, pending, formProps } = useActionForm(async (prev: FormState, data: FormData) => {
    const result = await addComment(projectId, target, prev, data);
    if (result.ok) onSent();
    return result;
  });
  return (
    <form {...formProps} className="flex flex-col gap-2">
      {point && (
        <>
          <input type="hidden" name="anchor_x" value={point.x.toFixed(4)} />
          <input type="hidden" name="anchor_y" value={point.y.toFixed(4)} />
        </>
      )}
      <textarea name="body" required rows={2} maxLength={2000} placeholder="Escribí un comentario" className="input" />
      <div className="flex flex-wrap items-center gap-2">
        {isPdf && (
          <label className="flex items-center gap-1 text-xs text-muted">
            Página
            <input name="page" inputMode="numeric" className="input w-16 px-2 py-1" />
          </label>
        )}
        <SubmitButton pending={pending} pendingLabel="Enviando…">
          {point ? "Comentar en ese punto" : "Comentar"}
        </SubmitButton>
        <FormMessage state={state} />
      </div>
      <FieldError errors={state.errors?.body} />
      <FieldError errors={state.errors?.page} />
    </form>
  );
}
