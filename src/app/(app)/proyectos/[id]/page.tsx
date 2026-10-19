import { Suspense } from "react";
import { PageSkeleton } from "@/components/skeleton";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrg, requireUser } from "@/lib/dal";
import { GUEST_KIND_LABEL, idSchema, type GuestKind } from "@/lib/validation";
import { removeGuest } from "../../actions";
import { GuestInviteForm } from "../../forms";
import { SubmitButton } from "@/components/form";
import { StatusPill } from "@/components/status-pill";
import { FeesSection } from "./fees-section";
import { ChangeOrdersSection } from "./change-orders-section";
import { DocumentsSection } from "./documents-section";
import { eventText, type EventRow } from "./event-text";
import { Disclosure } from "@/components/disclosure";
import { DeadlineForm } from "../../deadline-forms";
import { DEADLINE_SELECT, DeadlineList, type DeadlineRow } from "../../vencimientos/deadline-list";
import { loadComments } from "./comments";
import { ItemLine, SHIPMENT_SELECT, ShipmentsSection, type ShipmentRow } from "./shipments-section";
import { PIECE_SELECT, PieceRow, PiecesSection, type PieceRowData } from "./pieces-section";
import { changeOrderCode } from "@/lib/validation";
import { formatMoney } from "@/lib/format";

type Guest = {
  id: string;
  email: string;
  kind: GuestKind;
  accepted_at: string | null;
  created_at: string;
};

const dateFmt = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Argentina/Cordoba",
});

export default function ProjectPage({ params, searchParams }: PageProps<"/proyectos/[id]">) {
  return (
    <div className="flex flex-col gap-8">
      <Link href="/proyectos" className="text-sm text-muted hover:underline">← Proyectos</Link>
      <Suspense fallback={<PageSkeleton label="Cargando proyecto…" cards={3} list={false} />}>
        <Project params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Project({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const ocStage = typeof query.oc_etapa === "string" ? query.oc_etapa : undefined;
  if (!idSchema.safeParse(id).success) notFound();

  await requireUser();
  const supabase = await createClient();
  const [{ data: project }, org] = await Promise.all([
    supabase
      .from("projects")
      .select("id, org_id, name, code, client_name, status, organizations(name)")
      .eq("id", id)
      .maybeSingle(),
    getCurrentOrg(),
  ]);
  // RLS devuelve vacío si no hay acceso: se muestra igual que si no existiera.
  if (!project) notFound();

  const isMember = org?.id === project.org_id;
  const orgName = (project.organizations as unknown as { name: string } | null)?.name;

  return (
    <>
      <header className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold">{project.name}</h1>
          <p className="mt-1 text-sm text-muted">
            {[project.code, project.client_name, !isMember && orgName].filter(Boolean).join(" · ")}
          </p>
        </div>
        {isMember && (
          <div className="flex flex-wrap gap-2">
            <Link href={`/proyectos/${project.id}/historial`} className="btn btn-secondary">
              Historial
            </Link>
            {/* Descarga un archivo: enlace común, sin navegación del cliente. */}
            <a href={`/proyectos/${project.id}/exportar`} className="btn btn-secondary">
              Exportar a Excel
            </a>
          </div>
        )}
      </header>

      {isMember ? (
        <>
          <ProjectDeadlines projectId={project.id} />
          <FeesSection projectId={project.id} isOwner={org?.role === "owner"} />
          <ChangeOrdersSection projectId={project.id} isOwner={org?.role === "owner"} defaultStageId={ocStage} />
          <DocumentsSection projectId={project.id} />
          <PiecesSection projectId={project.id} />
          <ShipmentsSection projectId={project.id} />
          <Guests projectId={project.id} />
          <Activity projectId={project.id} />
        </>
      ) : (
        <>
          <section className="card">
            <h2 className="font-medium">Tu acceso</h2>
            <p className="mt-2 text-sm text-muted">
              {orgName ?? "El estudio"} te sumó a este proyecto. Acá vas a ver los adicionales que te envíen para
              aprobar y los planos vigentes a medida que el estudio los cargue.
            </p>
          </section>
          <GuestShipments projectId={project.id} />
          <GuestChangeOrders projectId={project.id} />
          <GuestPieces projectId={project.id} />
        </>
      )}
    </>
  );
}

// El invitado solo ve las órdenes que le enviaron a su correo (lo filtra la base).
const GUEST_STATUS: Record<string, string> = {
  sent: "Esperando tu respuesta: revisá el correo con el link para aprobarla",
  approved: "La aprobaste",
  billable: "La aprobaste",
  rejected: "La rechazaste",
  void: "Anulada por el estudio",
  draft: "El estudio la está revisando; te va a llegar la versión nueva",
};

async function GuestChangeOrders({ projectId }: { projectId: string }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("change_orders")
    .select("id, number, title, amount, currency, status")
    .eq("project_id", projectId)
    .order("number", { ascending: false });
  const orders = (data ?? []) as { id: string; number: number; title: string; amount: string; currency: string; status: string }[];
  if (orders.length === 0) return null;

  return (
    <section className="card flex flex-col gap-4">
      <h2 className="font-medium">Adicionales que te enviaron</h2>
      <ul className="flex flex-col divide-y divide-line">
        {orders.map((o) => (
          <li key={o.id} className="flex flex-col gap-1 py-3 first:pt-0">
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-sm text-muted">{changeOrderCode(o.number)}</span>
              <span className="min-w-0 flex-1 font-medium">{o.title}</span>
              <span className="font-mono whitespace-nowrap">{formatMoney(o.amount, o.currency)}</span>
            </div>
            <p className={`text-xs ${o.status === "sent" ? "text-warn" : "text-muted"}`}>{GUEST_STATUS[o.status] ?? o.status}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

// Lo que el estudio le compartió al invitado, avisando si ya no es lo vigente.
async function GuestShipments({ projectId }: { projectId: string }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("shipments")
    .select(SHIPMENT_SELECT)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  const shipments = (data ?? []) as unknown as ShipmentRow[];
  if (shipments.length === 0) return null;
  const comments = await loadComments(projectId, false);
  return (
    <section className="card flex flex-col gap-4">
      <h2 className="font-medium">Archivos que te compartieron</h2>
      {shipments.map((s) => (
        <div key={s.id} className="flex flex-col gap-1">
          <p className="text-xs text-muted">
            {dateFmt.format(new Date(s.created_at))}
            {s.note && ` · «${s.note}»`}
          </p>
          <ul className="flex flex-col divide-y divide-line text-sm">
            {s.shipment_items.map((i) => (
              <ItemLine
                key={i.id}
                item={i}
                projectId={projectId}
                comments={comments.get((i.revision_id ?? i.dependency_id)!) ?? []}
              />
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

// El renderista (u otro invitado) ve las piezas a su cargo y sube ahí su entrega.
async function GuestPieces({ projectId }: { projectId: string }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("dependencies")
    .select(PIECE_SELECT)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  const pieces = (data ?? []) as unknown as PieceRowData[];
  if (pieces.length === 0) return null;
  const comments = await loadComments(projectId, false);
  return (
    <section className="card flex flex-col gap-4">
      <h2 className="font-medium">Piezas a tu cargo</h2>
      <ul className="flex flex-col divide-y divide-line">
        {pieces.map((p) => (
          <PieceRow key={p.id} piece={p} canReview={false} currentCode={null} comments={comments.get(p.id) ?? []} />
        ))}
      </ul>
    </section>
  );
}

function requestTime() {
  return new Date();
}

// Vencimientos pendientes del proyecto, arriba de todo: son lo que no se puede pasar.
async function ProjectDeadlines({ projectId }: { projectId: string }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("deadlines")
    .select(DEADLINE_SELECT)
    .eq("project_id", projectId)
    .is("done_at", null)
    .order("due_date");
  const deadlines = (data ?? []) as unknown as DeadlineRow[];
  return (
    <section className="card flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 className="font-medium">Vencimientos</h2>
        <Link href="/vencimientos" className="ml-auto text-sm text-muted hover:underline">
          Ver todos
        </Link>
      </div>
      {deadlines.length > 0 && <DeadlineList deadlines={deadlines} showProject={false} now={requestTime()} />}
      <Disclosure
        defaultOpen={false}
        className="rounded-md border border-dashed border-line"
        summary="Nuevo vencimiento"
        summaryClassName="cursor-pointer px-4 py-3 text-sm font-medium"
      >
        <div className="border-t border-line p-4">
          <DeadlineForm projectId={projectId} />
        </div>
      </Disclosure>
    </section>
  );
}

async function Guests({ projectId }: { projectId: string }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("project_guests")
    .select("id, email, kind, accepted_at, created_at")
    .eq("project_id", projectId)
    .order("created_at");
  const guests = (data ?? []) as Guest[];

  return (
    <section className="card flex flex-col gap-6">
      <div>
        <h2 className="font-medium">Invitados externos</h2>
        <p className="mt-1 text-sm text-muted">
          Clientes, renderistas y contratistas. No pagan ni ocupan lugar en tu plan.
        </p>
      </div>
      <GuestInviteForm projectId={projectId} />
      {guests.length > 0 && (
        <ul className="divide-y divide-line">
          {guests.map((g) => (
            <li key={g.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
              <span className="font-medium break-all">{g.email}</span>
              <span className="badge">{GUEST_KIND_LABEL[g.kind]}</span>
              {g.accepted_at ? <StatusPill tone="ok">Ingresó</StatusPill> : <StatusPill>Pendiente</StatusPill>}
              <form action={removeGuest.bind(null, projectId, g.id)} className="ml-auto">
                <SubmitButton variant="ghost" pendingLabel="Quitando…">Quitar</SubmitButton>
              </form>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

async function Activity({ projectId }: { projectId: string }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("events")
    .select("id, type, actor_email, data, created_at")
    .or(`entity_id.eq.${projectId},data->>project_id.eq.${projectId}`)
    .order("created_at", { ascending: false })
    .limit(20);
  const events = (data ?? []) as EventRow[];
  if (events.length === 0) return null;

  return (
    <section className="card">
      <div className="mb-4 flex items-baseline gap-3">
        <h2 className="font-medium">Actividad</h2>
        <Link href={`/proyectos/${projectId}/historial`} className="ml-auto text-sm text-muted hover:underline">
          Ver todo el historial
        </Link>
      </div>
      <ol className="flex flex-col gap-2 text-sm">
        {events.map((e) => (
          <li key={e.id} className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
            <time className="shrink-0 text-muted sm:w-32">{dateFmt.format(new Date(e.created_at))}</time>
            <span>{eventText(e)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
