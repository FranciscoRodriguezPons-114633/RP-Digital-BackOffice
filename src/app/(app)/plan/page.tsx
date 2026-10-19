import { Suspense } from "react";
import { CardSkeleton } from "@/components/skeleton";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrg, getUser, requireUser } from "@/lib/dal";
import { FOUNDER_OFFER, PLANS, PLAN_LABEL, type PaidPlan } from "@/lib/plans";
import { BillingRequestForm } from "../plan-forms";

export const metadata: Metadata = { title: "Plan" };

const dateFmt = new Intl.DateTimeFormat("es-AR", { dateStyle: "long", timeZone: "America/Argentina/Cordoba" });

type Status = { plan: "trial" | PaidPlan; trial_ends_at: string; paid_until: string | null; members: number; active_projects: number };

// Server Component: se renderiza una vez por pedido, después de leer cookies.
function daysLeft(iso: string) {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
}

export default function PlanPage() {
  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-semibold">Plan</h1>
      <Suspense fallback={<CardSkeleton lines={2} />}>
        <Plan />
      </Suspense>
    </div>
  );
}

async function Plan() {
  await requireUser();
  const [org, user] = await Promise.all([getCurrentOrg(), getUser()]);
  if (!org) redirect("/proyectos");

  const supabase = await createClient();
  const [{ data: status }, { data: requests }] = await Promise.all([
    supabase.rpc("org_plan_status", { p_org_id: org.id }).single<Status>(),
    org.role === "owner"
      ? supabase.from("billing_requests").select("id, plan, status, created_at, paid_until").order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);
  if (!status) redirect("/proyectos");
  const pending = (requests ?? []).find((r) => r.status === "pending");
  const limits = status.plan === "trial" ? null : PLANS[status.plan];
  const trialLeft = daysLeft(status.trial_ends_at);

  return (
    <>
      <section className="card flex flex-col gap-2">
        <p className="text-sm text-muted">Tu estudio está en</p>
        <p className="text-2xl font-semibold">{PLAN_LABEL[status.plan]}</p>
        {status.plan === "trial" ? (
          <p className={`text-sm ${trialLeft <= 5 ? "text-warn" : "text-muted"}`}>
            {trialLeft > 0
              ? `Te quedan ${trialLeft} ${trialLeft === 1 ? "día" : "días"} de prueba (hasta el ${dateFmt.format(new Date(status.trial_ends_at))}).`
              : `La prueba terminó el ${dateFmt.format(new Date(status.trial_ends_at))}.`}
          </p>
        ) : (
          <p className="text-sm text-muted">
            Pago hasta el {status.paid_until ? dateFmt.format(new Date(`${status.paid_until}T12:00:00Z`)) : "—"}.
          </p>
        )}
        <p className="text-sm text-muted">
          {status.members} {status.members === 1 ? "usuario" : "usuarios"} · {status.active_projects}{" "}
          {status.active_projects === 1 ? "proyecto activo" : "proyectos activos"}
          {limits && ` (el plan incluye ${limits.users} usuarios${limits.projects ? ` y ${limits.projects} proyectos activos` : ""})`}
        </p>
      </section>

      {org.role !== "owner" ? (
        <p className="text-sm text-muted">El plan lo maneja el dueño del estudio.</p>
      ) : pending ? (
        <section className="card text-sm">
          Pediste pasar al plan {PLAN_LABEL[pending.plan as PaidPlan]} el {dateFmt.format(new Date(pending.created_at))}. Te
          mandamos los datos para la transferencia; cuando llegue el pago, el estudio queda en el plan.
        </section>
      ) : (
        <section className="card flex flex-col gap-4">
          <div>
            <h2 className="font-medium">{status.plan === "trial" ? "Pasar a pago" : "Cambiar de plan o renovar"}</h2>
            <p className="mt-1 text-sm text-muted">{FOUNDER_OFFER}</p>
          </div>
          <BillingRequestForm defaultEmail={user?.email ?? ""} />
        </section>
      )}
    </>
  );
}
