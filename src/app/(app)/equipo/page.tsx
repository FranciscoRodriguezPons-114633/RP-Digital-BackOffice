import { Suspense } from "react";
import { CardSkeleton } from "@/components/skeleton";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { countGuestProjects, getCurrentOrg, hasWorks, requireUser } from "@/lib/dal";
import { formatDate, formatMoney, todayInCordoba } from "@/lib/format";
import { MemberInviteForm } from "../forms";
import { OrganizationKindForm } from "../work-forms";
import { DeleteMemberCostButton, MemberCostForm } from "../cost-forms";
import { ORG_KIND_LABEL } from "@/lib/validation";

export const metadata: Metadata = { title: "Equipo" };

type Member = { user_id: string; email: string; role: "owner" | "member" };
type MemberCost = { id: string; user_id: string; hourly_cost: string; currency: string; valid_from: string };
type Invitation = { id: string; email: string; role: "owner" | "member"; created_at: string };

const ROLE_LABEL = { owner: "Dueño", member: "Miembro" } as const;

function requestTime() {
  return new Date();
}

export default function TeamPage() {
  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-semibold">Equipo</h1>
      <Suspense fallback={<CardSkeleton label="Cargando equipo…" lines={4} />}>
        <Team />
      </Suspense>
    </div>
  );
}

async function Team() {
  const user = await requireUser();
  const org = await getCurrentOrg();
  if (!org) redirect((await countGuestProjects()) > 0 ? "/proyectos" : "/onboarding");

  const supabase = await createClient();
  const showCosts = org.role === "owner" && hasWorks(org);
  const [{ data: members }, { data: invitations }, { data: costData }] = await Promise.all([
    supabase.rpc("list_org_members", { p_org_id: org.id }),
    supabase
      .from("member_invitations")
      .select("id, email, role, created_at")
      .eq("org_id", org.id)
      .is("accepted_at", null)
      .order("created_at"),
    showCosts
      ? supabase
          .from("member_costs")
          .select("id, user_id, hourly_cost, currency, valid_from")
          .eq("org_id", org.id)
          .order("valid_from", { ascending: false })
      : Promise.resolve({ data: [] as MemberCost[] }),
  ]);
  const memberList = (members ?? []) as Member[];
  const costs = (costData ?? []) as MemberCost[];
  const today = todayInCordoba(requestTime());
  const emailOf = new Map(memberList.map((m) => [m.user_id, m.email]));
  // Costo vigente hoy: el último con fecha de vigencia anterior o igual a hoy.
  const current = new Map<string, MemberCost>();
  for (const c of costs) if (c.valid_from <= today && !current.has(c.user_id)) current.set(c.user_id, c);

  return (
    <>
      <section className="card">
        <div className="mb-4 flex flex-wrap items-baseline gap-3">
          <h2 className="font-medium">{org.name}</h2>
          <span className="badge">{ORG_KIND_LABEL[org.kind]}</span>
        </div>
        <ul className="divide-y divide-line text-sm">
          {memberList.map((m) => (
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

      {org.role === "owner" && (
        <section className="card flex flex-col gap-3">
          <div>
            <h2 className="font-medium">Tipo de organización</h2>
            <p className="mt-1 text-sm text-muted">Define qué funciones ves. Lo puede cambiar solo el dueño.</p>
          </div>
          <OrganizationKindForm kind={org.kind} />
        </section>
      )}

      {showCosts && (
        <section className="card flex flex-col gap-4">
          <div>
            <h2 className="font-medium">Costo por hora</h2>
            <p className="mt-1 text-sm text-muted">
              Lo que le cuesta al estudio una hora de cada persona (sueldo, cargas y lo que corresponda), desde una
              fecha. Cada hora cargada usa el costo vigente a su fecha; con eso sale la rentabilidad de cada proyecto.
              Solo lo ves vos.
            </p>
          </div>
          <ul className="divide-y divide-line text-sm">
            {memberList.map((m) => {
              const c = current.get(m.user_id);
              return (
                <li key={m.user_id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2">
                  <span>{m.email}</span>
                  <span className={`ml-auto font-mono ${c ? "" : "text-warn"}`}>
                    {c ? `${formatMoney(c.hourly_cost, c.currency)}/h desde el ${formatDate(c.valid_from)}` : "Sin costo cargado"}
                  </span>
                </li>
              );
            })}
          </ul>
          <MemberCostForm members={memberList.map(({ user_id, email }) => ({ user_id, email }))} today={today} />
          {costs.length > 0 && (
            <details className="rounded-md border border-line">
              <summary className="cursor-pointer px-4 py-2 text-sm">Historial de costos ({costs.length})</summary>
              <ul className="divide-y divide-line border-t border-line px-4 text-sm">
                {costs.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                    <span>{emailOf.get(c.user_id) ?? "Ex miembro"}</span>
                    <span className="text-muted">desde el {formatDate(c.valid_from)}</span>
                    <span className="ml-auto font-mono">{formatMoney(c.hourly_cost, c.currency)}/h</span>
                    <DeleteMemberCostButton
                      id={c.id}
                      label={`de ${emailOf.get(c.user_id) ?? "esta persona"} desde el ${formatDate(c.valid_from)}`}
                    />
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}

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
