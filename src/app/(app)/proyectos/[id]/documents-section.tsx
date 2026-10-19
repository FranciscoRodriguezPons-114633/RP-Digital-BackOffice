import { createClient } from "@/lib/supabase/server";
import { Disclosure } from "@/components/disclosure";
import { SubmitButton } from "@/components/form";
import { StatusPill, type PillTone } from "@/components/status-pill";
import { formatBytes } from "@/lib/format";
import { DISCIPLINE_LABEL, REVISION_STATUS_LABEL, nextRevisionCode, type Discipline, type RevisionStatus } from "@/lib/validation";
import { discardRevision } from "../../document-actions";
import { BulkUploadForm, DocumentForm, PublishRevisionButton, RevisionUploadForm } from "../../document-forms";
import { CommentThread } from "../../comment-thread";
import { loadComments } from "./comments";

type RevisionRow = {
  id: string;
  code: string;
  status: RevisionStatus;
  file_name: string;
  file_size: number;
  mime_type: string;
  sha256: string | null;
  uploaded_at: string | null;
  published_at: string | null;
  notes: string | null;
  created_at: string;
};

type DocumentRow = {
  id: string;
  code: string;
  title: string;
  discipline: Discipline;
  revisions: RevisionRow[];
};

const STATUS_TONE: Record<RevisionStatus, PillTone> = {
  draft: "neutral",
  shared: "warn",
  published: "accent",
  superseded: "neutral",
};

const dateFmt = new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeZone: "America/Argentina/Cordoba" });

export async function DocumentsSection({ projectId }: { projectId: string }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("documents")
    .select(
      "id, code, title, discipline, revisions(id, code, status, file_name, file_size, mime_type, sha256, uploaded_at, published_at, notes, created_at)",
    )
    .eq("project_id", projectId)
    .order("code")
    .order("created_at", { referencedTable: "revisions", ascending: false });
  const documents = (data ?? []) as unknown as DocumentRow[];
  const comments = await loadComments(projectId, true);

  return (
    <section id="documentos" className="card flex scroll-mt-6 flex-col gap-6">
      <div>
        <h2 className="font-medium">Planos y documentos</h2>
        <p className="mt-1 text-sm text-muted">
          Cada documento tiene una sola revisión vigente. Al publicar una nueva, la anterior queda reemplazada y cada
          archivo guarda su huella (SHA-256) para saber exactamente qué se compartió.
        </p>
      </div>

      <Disclosure
        defaultOpen={documents.length === 0}
        className="rounded-md border border-dashed border-line"
        summary="Nuevo documento"
        summaryClassName="cursor-pointer px-4 py-3 text-sm font-medium"
      >
        <div className="border-t border-line p-4">
          <DocumentForm projectId={projectId} />
        </div>
      </Disclosure>

      <Disclosure
        defaultOpen={false}
        className="rounded-md border border-dashed border-line"
        summary="Cargar varios planos de una vez"
        summaryClassName="cursor-pointer px-4 py-3 text-sm font-medium"
      >
        <div className="border-t border-line p-4">
          <BulkUploadForm projectId={projectId} />
        </div>
      </Disclosure>

      {documents.length > 0 && (
        <ul className="flex flex-col divide-y divide-line">
          {documents.map((d) => {
            const current = d.revisions.find((r) => r.status === "published");
            return (
              <li key={d.id} className="flex flex-col gap-2 py-4 first:pt-0">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-mono text-sm text-muted">{d.code}</span>
                  <span className="min-w-0 flex-1 font-medium">{d.title}</span>
                  {current ? (
                    <a href={`/archivos/${current.id}`} className="text-sm text-accent underline">
                      Vigente: {current.code}
                    </a>
                  ) : (
                    <span className="text-sm text-muted">Sin revisión vigente</span>
                  )}
                </div>
                <div className="text-xs text-muted">
                  {DISCIPLINE_LABEL[d.discipline]}
                  {current?.published_at && ` · publicada el ${dateFmt.format(new Date(current.published_at))}`}
                </div>
                <details className="rounded-md border border-line">
                  <summary className="cursor-pointer px-4 py-2 text-sm">
                    Revisiones ({d.revisions.length}) y subir nueva
                  </summary>
                  <div className="flex flex-col gap-5 border-t border-line p-4">
                    {d.revisions.length > 0 && (
                      <ul className="flex flex-col divide-y divide-line text-sm">
                        {d.revisions.map((r) => (
                          <li key={r.id} className="flex flex-col gap-1 py-2 first:pt-0">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                              <span className="font-mono font-medium">{r.code}</span>
                              {r.uploaded_at ? (
                                <StatusPill tone={STATUS_TONE[r.status]} struck={r.status === "superseded"}>
                                  {REVISION_STATUS_LABEL[r.status]}
                                </StatusPill>
                              ) : (
                                <StatusPill tone="warn">Subida incompleta</StatusPill>
                              )}
                              <span className="ml-auto flex items-center gap-2">
                                {r.uploaded_at && (
                                  <a href={`/archivos/${r.id}`} className="btn btn-secondary btn-sm">
                                    Descargar
                                  </a>
                                )}
                                {r.uploaded_at && (r.status === "draft" || r.status === "shared") && (
                                  <PublishRevisionButton
                                    projectId={projectId}
                                    revisionId={r.id}
                                    label={`${d.code} ${r.code}`}
                                    replaces={current ? current.code : null}
                                  />
                                )}
                                {!r.uploaded_at && (
                                  <form action={discardRevision.bind(null, projectId, r.id)}>
                                    <SubmitButton variant="ghost" pendingLabel="…">Descartar</SubmitButton>
                                  </form>
                                )}
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
                              <span className="break-all">{r.file_name}</span>
                              <span>{formatBytes(r.file_size)}</span>
                              <span>{dateFmt.format(new Date(r.created_at))}</span>
                              {r.sha256 && (
                                <span className="font-mono" title={`SHA-256 ${r.sha256}`}>
                                  huella {r.sha256.slice(0, 12)}…
                                </span>
                              )}
                            </div>
                            {r.notes && <p className="text-xs text-muted">{r.notes}</p>}
                            {r.uploaded_at && (
                              <CommentThread
                                projectId={projectId}
                                target={{ revisionId: r.id, dependencyId: null }}
                                comments={comments.get(r.id) ?? []}
                                isPdf={r.mime_type === "application/pdf"}
                                imageUrl={r.mime_type.startsWith("image/") ? `/archivos/${r.id}?ver` : undefined}
                              />
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className={d.revisions.length > 0 ? "border-t border-line pt-5" : ""}>
                      <RevisionUploadForm
                        projectId={projectId}
                        documentId={d.id}
                        suggestedCode={nextRevisionCode(d.revisions[0]?.code) ?? ""}
                      />
                    </div>
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
