import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { ListSkeleton } from "@/components/skeleton";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrg, hasWorks, requireUser } from "@/lib/dal";
import {
  GROSS_INCOME_CONDITION_LABEL,
  PARTY_ROLE_LABEL,
  VAT_CONDITION_LABEL,
  formatCuit,
} from "@/lib/validation";
import { DeletePartyForm, PartyForm, type PartyValues } from "../party-forms";

export const metadata: Metadata = { title: "Terceros" };

export default function PartiesPage() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">Terceros</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Comitentes, proveedores y subcontratistas, con su CUIT y su condición impositiva. El comitente se elige en la
          ficha de obra; los proveedores y subcontratistas se usan en presupuestos y compras.
        </p>
      </div>
      <Suspense fallback={<ListSkeleton rows={4} />}>
        <Parties />
      </Suspense>
    </div>
  );
}

async function Parties() {
  await requireUser();
  const org = await getCurrentOrg();
  if (!org) redirect("/proyectos");
  if (!hasWorks(org)) notFound();

  const supabase = await createClient();
  const { data } = await supabase
    .from("parties")
    .select("id, name, tax_id, roles, vat_condition, gross_income_condition, email, phone, address, notes")
    .eq("org_id", org.id)
    .order("name");
  const parties = (data ?? []) as PartyValues[];

  return (
    <>
      <section className="card flex flex-col gap-4">
        <h2 className="font-medium">Registrar un tercero</h2>
        <PartyForm />
      </section>

      {parties.length === 0 ? (
        <p className="text-sm text-muted">Todavía no hay terceros registrados.</p>
      ) : (
        <section className="card flex flex-col gap-4">
          <h2 className="font-medium">
            {parties.length} {parties.length === 1 ? "tercero" : "terceros"}
          </h2>
          <ul className="flex flex-col divide-y divide-line">
            {parties.map((p) => (
              <li key={p.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-medium">{p.name}</span>
                  <span className="font-mono text-sm text-muted">{formatCuit(p.tax_id)}</span>
                  <span className="ml-auto flex flex-wrap gap-1">
                    {p.roles.map((r) => (
                      <span key={r} className="badge">
                        {PARTY_ROLE_LABEL[r]}
                      </span>
                    ))}
                  </span>
                </div>
                <p className="text-xs text-muted">
                  {[
                    p.vat_condition && VAT_CONDITION_LABEL[p.vat_condition],
                    p.gross_income_condition && `IIBB: ${GROSS_INCOME_CONDITION_LABEL[p.gross_income_condition]}`,
                    p.email,
                    p.phone,
                    p.address,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "Sin datos de contacto"}
                </p>
                <details className="rounded-md border border-line">
                  <summary className="cursor-pointer px-4 py-2 text-sm">Editar {p.name}</summary>
                  <div className="flex flex-col gap-5 border-t border-line p-4">
                    <PartyForm party={p} />
                    {org.role === "owner" && (
                      <div className="border-t border-line pt-4">
                        <DeletePartyForm id={p.id} name={p.name} />
                      </div>
                    )}
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
