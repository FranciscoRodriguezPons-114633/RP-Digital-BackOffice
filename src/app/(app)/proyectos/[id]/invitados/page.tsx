import { Suspense } from "react";
import type { Metadata } from "next";
import { PageSkeleton } from "@/components/skeleton";
import { SubmitButton } from "@/components/form";
import { StatusPill } from "@/components/status-pill";
import { GUEST_KIND_LABEL } from "@/lib/validation";
import { removeGuest } from "../../../actions";
import { GuestInviteForm } from "../../../forms";
import { loadMemberProject } from "../project-header";
import { loadProjectGuests } from "../guests";

export const metadata: Metadata = { title: "Invitados" };

export default function GuestsPage({ params }: PageProps<"/proyectos/[id]/invitados">) {
  return (
    <Suspense fallback={<PageSkeleton label="Cargando invitados…" title={false} cards={1} />}>
      <Guests params={params} />
    </Suspense>
  );
}

async function Guests({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await loadMemberProject(id);
  const guests = await loadProjectGuests(id);

  return (
    <section className="card flex flex-col gap-6">
      <div>
        <h2 className="font-bold">Invitados externos</h2>
        <p className="mt-1 text-sm text-muted">
          Clientes, renderistas y contratistas. No pagan ni ocupan lugar en tu plan.
        </p>
      </div>
      <GuestInviteForm projectId={id} />
      {guests.length > 0 && (
        <ul className="divide-y divide-line">
          {guests.map((g) => (
            <li key={g.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
              <span className="font-medium break-all">{g.email}</span>
              <span className="badge">{GUEST_KIND_LABEL[g.kind]}</span>
              {g.accepted_at ? <StatusPill tone="ok">Ingresó</StatusPill> : <StatusPill>Pendiente</StatusPill>}
              <form action={removeGuest.bind(null, id, g.id)} className="ml-auto">
                <SubmitButton variant="ghost" pendingLabel="Quitando…">Quitar</SubmitButton>
              </form>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
