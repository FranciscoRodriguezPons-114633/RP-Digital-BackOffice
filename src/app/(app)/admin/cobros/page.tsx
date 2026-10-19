import { Suspense } from "react";
import { ListSkeleton } from "@/components/skeleton";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/dal";
import { PLAN_LABEL, type PaidPlan } from "@/lib/plans";
import { DecideBillingForm } from "../../plan-forms";
import { StatusPill } from "@/components/status-pill";

export const metadata: Metadata = { title: "Cobros" };

type Request = {
  id: string;
  org_name: string;
  plan: PaidPlan;
  billing_cycle: "monthly" | "yearly";
  billing_name: string;
  tax_id: string;
  billing_email: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  paid_until: string | null;
};

const dateFmt = new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeZone: "America/Argentina/Cordoba" });
const STATUS = {
  pending: { label: "Pendiente", tone: "warn" },
  approved: { label: "Pagado", tone: "ok" },
  rejected: { label: "Rechazado", tone: "danger" },
} as const;

// "Hasta" sugerido al confirmar: un mes o un año desde hoy, según el pedido.
function suggestedPaidUntil(cycle: "monthly" | "yearly") {
  const d = new Date();
  if (cycle === "yearly") d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 10);
}

export default function BillingAdminPage() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">Cobros</h1>
        <p className="mt-1 text-sm text-muted">
          Pedidos de pase a pago de los estudios. Cuando llega la transferencia, confirmá el pago y el estudio queda en
          su plan.
        </p>
      </div>
      <Suspense fallback={<ListSkeleton rows={3} />}>
        <Requests />
      </Suspense>
    </div>
  );
}

async function Requests() {
  await requireUser();
  const supabase = await createClient();
  // Solo la administración de la plataforma: para cualquier otro, la página no existe.
  const { data, error } = await supabase.rpc("list_billing_requests");
  if (error) notFound();
  const requests = (data ?? []) as Request[];
  if (requests.length === 0) return <p className="text-sm text-muted">No hay pedidos.</p>;

  return (
    <ul className="flex flex-col gap-4">
      {requests.map((r) => (
        <li key={r.id} className="card flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-medium">{r.org_name}</span>
            <span className="text-sm text-muted">
              {PLAN_LABEL[r.plan]} · {r.billing_cycle === "yearly" ? "anual" : "mensual"}
            </span>
            <StatusPill tone={STATUS[r.status].tone} className="ml-auto self-center">
              {STATUS[r.status].label}
              {r.paid_until && ` hasta el ${dateFmt.format(new Date(`${r.paid_until}T12:00:00Z`))}`}
            </StatusPill>
          </div>
          <div className="text-sm text-muted">
            {r.billing_name} · CUIT {r.tax_id} · {r.billing_email} · pedido el {dateFmt.format(new Date(r.created_at))}
          </div>
          {r.status === "pending" && <DecideBillingForm requestId={r.id} defaultPaidUntil={suggestedPaidUntil(r.billing_cycle)} />}
        </li>
      ))}
    </ul>
  );
}
