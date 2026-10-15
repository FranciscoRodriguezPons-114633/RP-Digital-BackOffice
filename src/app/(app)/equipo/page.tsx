import { Suspense } from "react";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrg, requireUser } from "@/lib/dal";
import { MemberInviteForm } from "../forms";

export const metadata: Metadata = { title: "Equipo" };

type Member = { user_id: string; email: string; role: "owner" | "member" };
type Invitation = { id: string; email: string; role: "owner" | "member"; created_at: string };

const ROLE_LABEL = { owner: "Dueño", member: "Miembro" } as const;

export default function TeamPage() {
  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-semibold">Equipo</h1>
      <Suspense fallback={<p className="text-sm text-muted">Cargando equipo…</p>}>
        <Team />
      </Suspense>
    </div>
  );
}

async function Team() {
  const user = await requireUser();
  const org = await getCurrentOrg();
  if (!org) redirect("/onboarding");

  const supabase = await createClient();
  const [{ data: members }, { data: invitations }] = await Promise.all([
    supabase.rpc("list_org_members", { p_org_id: org.id }),
    supabase
      .from("member_invitations")
      .select("id, email, role, created_at")
      .eq("org_id", org.id)
      .is("accepted_at", null)
      .order("created_at"),
  ]);

  return (
    <>
      <section className="card">
        <h2 className="mb-4 font-medium">{org.name}</h2>
        <ul className="divide-y divide-line text-sm">
          {((members ?? []) as Member[]).map((m) => (
            <li key={m.user_id} className="flex items-center gap-3 py-2">
              <span className="font-medium">{m.email}</span>
              {m.user_id === user.id && <span className="text-muted">(vos)</span>}
              <span className="badge ml-auto">{ROLE_LABEL[m.role]}</span>
            </li>
          ))}
          {((invitations ?? []) as Invitation[]).map((i) => (
            <li key={i.id} className="flex items-center gap-3 py-2">
              <span>{i.email}</span>
              <span className="text-muted">Invitación pendiente</span>
              <span className="badge ml-auto">{ROLE_LABEL[i.role]}</span>
            </li>
          ))}
        </ul>
      </section>

      {org.role === "owner" ? (
        <section className="card">
          <h2 className="mb-4 font-medium">Sumar a alguien del estudio</h2>
          <MemberInviteForm orgId={org.id} />
        </section>
      ) : (
        <p className="text-sm text-muted">Solo el dueño del estudio puede sumar miembros.</p>
      )}
    </>
  );
}
