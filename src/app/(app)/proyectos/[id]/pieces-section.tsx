import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Disclosure } from "@/components/disclosure";
import { StatusPill, type PillTone } from "@/components/status-pill";
import { formatBytes } from "@/lib/format";
import { PIECE_KIND_LABEL, PIECE_STATUS_LABEL, type PieceKind, type PieceStatus } from "@/lib/validation";
import { CloseRoundButton, PieceFileForm, PieceForm, ReviewPieceButtons, type SourceChoice } from "../../piece-forms";
import { CommentThread, type CommentView } from "../../comment-thread";
import { loadComments } from "./comments";

export type PieceRowData = {
  id: string;
  project_id: string;
  kind: PieceKind;
  title: string;
  status: PieceStatus;
  responsible_email: string | null;
  rounds_contracted: number | null;
  current_round: number;
  file_name: string | null;
  file_size: number | null;
  mime_type: string | null;
  sha256: string | null;
  uploaded_at: string | null;
  status_changed_at: string | null;
  revisions: { code: string; document_id: string; documents: { code: string; title: string } | null } | null;
  projects?: { name: string } | null;
};

export const PIECE_SELECT =
  "id, project_id, kind, title, status, responsible_email, rounds_contracted, current_round, file_name, file_size, mime_type, sha256, uploaded_at, status_changed_at, " +
  "revisions!dependencies_source_revision_id_fkey(code, document_id, documents(code, title))";

const STATUS_TONE: Record<PieceStatus, PillTone> = {
  current: "accent",
  revalidated: "accent",
  to_review: "warn",
  obsolete: "danger",
};

// Revisión vigente de cada documento, para decir "C01 → C02" en las piezas a revisar.
export async function currentRevisionByDocument(projectIds?: string[]) {
  const supabase = await createClient();
  let query = supabase.from("revisions").select("id, code, document_id, documents(code, title)").eq("status", "published");
  if (projectIds) query = query.in("project_id", projectIds);
  const { data } = await query;
  const rows = (data ?? []) as unknown as { id: string; code: string; document_id: string; documents: { code: string; title: string } | null }[];
  return new Map(rows.map((r) => [r.document_id, r]));
}

export function PieceRow({
  piece,
  currentCode,
  canReview,
  showProject = false,
  comments,
}: {
  piece: PieceRowData;
  currentCode: string | null;
  canReview: boolean;
  showProject?: boolean;
  comments?: CommentView[];
}) {
  const source = piece.revisions;
  const doc = source?.documents;
  return (
    <li className="flex flex-col gap-2 py-4 first:pt-0">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-xs text-muted">{PIECE_KIND_LABEL[piece.kind]}</span>
        <span className="min-w-0 flex-1 font-medium">{piece.title}</span>
        <StatusPill tone={STATUS_TONE[piece.status]} className="self-center">
          {PIECE_STATUS_LABEL[piece.status]}
        </StatusPill>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
        {showProject && piece.projects && (
          <Link href={`/proyectos/${piece.project_id}#piezas`} className="underline">
            {piece.projects.name}
          </Link>
        )}
        {doc && source && (
          <span>
            Hecha sobre {doc.code} {source.code}
            {piece.status === "to_review" && currentCode && currentCode !== source.code && (
              <span className="text-warn"> · ahora vigente: {currentCode}</span>
            )}
          </span>
        )}
        {piece.responsible_email && <span>A cargo de {piece.responsible_email}</span>}
        <RoundInfo piece={piece} />
        {piece.uploaded_at ? (
          <a href={`/archivos/${piece.id}`} className="underline">
            {piece.file_name} ({formatBytes(piece.file_size)})
          </a>
        ) : (
          <span>Sin archivo todavía</span>
        )}
        {piece.sha256 && (
          <span className="font-mono" title={`SHA-256 ${piece.sha256}`}>
            huella {piece.sha256.slice(0, 12)}…
          </span>
        )}
      </div>
      {canReview && comments && piece.uploaded_at && piece.status !== "obsolete" && (
        <CloseRoundButton projectId={piece.project_id} pieceId={piece.id} round={piece.current_round} />
      )}
      {piece.status === "to_review" && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-warn/40 bg-background p-3 text-sm">
          <p className="min-w-0 flex-1 text-xs">
            {doc?.code} {source?.code} quedó reemplazada{currentCode ? ` por la ${currentCode}` : ""}. ¿Esta pieza sigue
            sirviendo?
          </p>
          {canReview && <ReviewPieceButtons projectId={piece.project_id} pieceId={piece.id} newCode={currentCode} />}
        </div>
      )}
      {comments && piece.uploaded_at && (
        <CommentThread
          projectId={piece.project_id}
          target={{ revisionId: null, dependencyId: piece.id }}
          comments={comments}
          isPdf={piece.mime_type === "application/pdf"}
          imageUrl={piece.mime_type?.startsWith("image/") ? `/archivos/${piece.id}?ver` : undefined}
        />
      )}
      {!piece.uploaded_at && piece.status !== "obsolete" && (
        <details className="rounded-md border border-line">
          <summary className="cursor-pointer px-4 py-2 text-sm">Subir el archivo de la pieza</summary>
          <div className="border-t border-line p-4">
            <PieceFileForm projectId={piece.project_id} pieceId={piece.id} />
          </div>
        </details>
      )}
    </li>
  );
}

// "Ronda 2 de 3"; pasada la cantidad contratada, avisa.
function RoundInfo({ piece }: { piece: PieceRowData }) {
  const over = piece.rounds_contracted !== null && piece.current_round > piece.rounds_contracted;
  return (
    <span className={over ? "font-medium text-warn" : ""}>
      Ronda {piece.current_round}
      {piece.rounds_contracted !== null && ` de ${piece.rounds_contracted} contratadas`}
      {over && " · se pasaron las rondas contratadas"}
    </span>
  );
}

const STATUS_ORDER: Record<PieceStatus, number> = { to_review: 0, current: 1, revalidated: 1, obsolete: 2 };

export async function PiecesSection({ projectId }: { projectId: string }) {
  const supabase = await createClient();
  const [{ data }, current, { data: guestData }, comments] = await Promise.all([
    supabase.from("dependencies").select(PIECE_SELECT).eq("project_id", projectId).order("created_at", { ascending: false }),
    currentRevisionByDocument([projectId]),
    supabase.from("project_guests").select("email, kind").eq("project_id", projectId),
    loadComments(projectId, true),
  ]);
  const pieces = ((data ?? []) as unknown as PieceRowData[]).sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
  const sources: SourceChoice[] = [...current.values()]
    .map((r) => ({ id: r.id, label: `${r.documents?.code ?? ""} ${r.code} · ${r.documents?.title ?? ""}` }))
    .sort((a, b) => a.label.localeCompare(b.label, "es"));
  const guests = (guestData ?? []) as { email: string; kind: string }[];
  const emails = [...guests.filter((g) => g.kind === "renderer"), ...guests.filter((g) => g.kind !== "renderer")].map((g) => g.email);

  return (
    <section id="piezas" className="card flex scroll-mt-6 flex-col gap-6">
      <div>
        <h2 className="font-medium">Piezas dependientes</h2>
        <p className="mt-1 text-sm text-muted">
          Renders, planos de venta y brochures hechos sobre una revisión. Si esa revisión se reemplaza, la pieza queda
          «a revisar» y su responsable recibe un aviso.
        </p>
      </div>
      {sources.length === 0 ? (
        <p className="text-sm text-muted">Para cargar piezas, primero publicá una revisión en Planos y documentos.</p>
      ) : (
        <Disclosure
          defaultOpen={pieces.length === 0}
          className="rounded-md border border-dashed border-line"
          summary="Nueva pieza"
          summaryClassName="cursor-pointer px-4 py-3 text-sm font-medium"
        >
          <div className="border-t border-line p-4">
            <PieceForm projectId={projectId} sources={sources} emails={emails} />
          </div>
        </Disclosure>
      )}
      {pieces.length > 0 && (
        <ul className="flex flex-col divide-y divide-line">
          {pieces.map((p) => (
            <PieceRow
              key={p.id}
              piece={p}
              canReview
              comments={comments.get(p.id) ?? []}
              currentCode={p.revisions ? (current.get(p.revisions.document_id)?.code ?? null) : null}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
