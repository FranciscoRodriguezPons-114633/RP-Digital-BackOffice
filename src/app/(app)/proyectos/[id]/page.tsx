import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrg, requireUser } from "@/lib/dal";
import { GUEST_KIND_LABEL, idSchema, type GuestKind } from "@/lib/validation";
import { removeGuest } from "../../actions";
import { GuestInviteForm } from "../../forms";
import { SubmitButton } from "@/components/form";
import { FeesSection } from "./fees-section";

type Guest = {
  id: string;
  email: string;
  kind: GuestKind;
  accepted_at: string | null;
  created_at: string;
};

type EventRow = {
  id: number;
  type: string;
  actor_email: string | null;
  data: Record<string, unknown>;
  created_at: string;
};

const EVENT_LABEL: Record<string, string> = {
  "project.created": "creó el proyecto",
  "project.updated": "modificó el proyecto",
  "guest.invited": "invitó a",
  "guest.accepted": "Un invitado aceptó el acceso",
  "guest.removed": "quitó a",
};

function eventText(e: EventRow) {
  if (e.type === "stage.hours_80" || e.type === "stage.hours_100") {
    const pct = e.type.endsWith("80") ? "80%" : "100%";
    return `«${String(e.data?.stage_name ?? "Una etapa")}» llegó al ${pct} de las horas previstas`;
  }
  const who = e.type === "guest.accepted" ? "" : `${e.actor_email ?? "Alguien"} `;
  const email = typeof e.data?.email === "string" ? ` ${e.data.email}` : "";
  return `${who}${EVENT_LABEL[e.type] ?? e.type}${email}`;
}

const dateFmt = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Argentina/Cordoba",
});

export default function ProjectPage({ params }: PageProps<"/proyectos/[id]">) {
  return (
    <div className="flex flex-col gap-8">
      <Link href="/proyectos" className="text-sm text-muted hover:underline">← Proyectos</Link>
      <Suspense fallback={<p className="text-sm text-muted">Cargando proyecto…</p>}>
        <Project params={params} />
      </Suspense>
    </div>
  );
}

async function Project({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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
      <header>
        <h1 className="text-2xl font-semibold">{project.name}</h1>
        <p className="mt-1 text-sm text-muted">
          {[project.code, project.client_name, !isMember && orgName].filter(Boolean).join(" · ")}
        </p>
      </header>

      {isMember ? (
        <>
          <FeesSection projectId={project.id} isOwner={org?.role === "owner"} />
          <Guests projectId={project.id} />
          <Activity projectId={project.id} />
        </>
      ) : (
        <section className="card">
          <h2 className="font-medium">Tu acceso</h2>
          <p className="mt-2 text-sm text-muted">
            {orgName ?? "El estudio"} te sumó a este proyecto. Acá vas a ver los honorarios, adicionales
            para aprobar y los planos vigentes a medida que el estudio los cargue.
          </p>
        </section>
      )}
    </>
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
              <span className="text-muted">{g.accepted_at ? "Ingresó" : "Pendiente"}</span>
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
      <h2 className="mb-4 font-medium">Actividad</h2>
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
