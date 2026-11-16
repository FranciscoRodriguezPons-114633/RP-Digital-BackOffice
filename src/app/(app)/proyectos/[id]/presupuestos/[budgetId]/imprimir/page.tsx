import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PageSkeleton } from "@/components/skeleton";
import { formatArea, formatCostPerM2, formatDate, formatIndexValue, formatMoney, todayInCordoba } from "@/lib/format";
import { OVERHEAD_KIND_LABEL } from "@/lib/budgets";
import { BUDGET_LEVEL_LABEL, BUDGET_STATUS_LABEL, idSchema } from "@/lib/validation";
import { loadWorksProject } from "../../../project-header";
import { SummaryTable } from "../budget-summary";
import { loadBudgetDocument } from "../budget-document";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "Imprimir presupuesto" };

const qty = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 4 });

// Un Server Component se renderiza una vez por pedido: la hora es estable dentro del render.
function requestTime() {
  return new Date();
}

export default function PrintPage({ params }: PageProps<"/proyectos/[id]/presupuestos/[budgetId]/imprimir">) {
  return (
    <Suspense fallback={<PageSkeleton label="Preparando el presupuesto…" title={false} cards={2} list={false} />}>
      <PrintBudget params={params} />
    </Suspense>
  );
}

// El presupuesto como documento para el cliente: al imprimir, la página deja solo esto (ver
// .print-doc en globals.css) y el navegador lo guarda como PDF.
async function PrintBudget({ params }: { params: Promise<{ id: string; budgetId: string }> }) {
  const { id, budgetId } = await params;
  if (!idSchema.safeParse(budgetId).success) notFound();
  const { project, org } = await loadWorksProject(id);
  const doc = await loadBudgetDocument(id, budgetId);
  if (!doc) notFound();
  const { budget, totals, chapters, overheads } = doc;
  const draft = budget.status === "draft";

  return (
    <>
      <div className="no-print flex flex-wrap items-center gap-3">
        <Link href={`/proyectos/${project.id}/presupuestos/${budget.id}`} className="text-sm text-muted hover:underline">
          Volver al presupuesto
        </Link>
        <span className="ml-auto" />
        <PrintButton />
      </div>

      <article className="print-doc card flex flex-col gap-6">
        <header className="flex flex-wrap items-start gap-4 border-b border-line pb-4">
          <div className="min-w-0 grow">
            <p className="text-sm font-semibold text-muted">{org.name}</p>
            <h1 className="text-2xl font-extrabold tracking-tight">
              Presupuesto V{budget.number} · {project.name}
            </h1>
            <p className="text-sm text-muted">
              {[project.code, project.client_name].filter(Boolean).join(" · ")}
              {" · "}
              {BUDGET_LEVEL_LABEL[budget.level]} en {budget.currency}
            </p>
          </div>
          <div className="text-right text-sm">
            <p className="font-semibold">{draft ? "Borrador" : BUDGET_STATUS_LABEL[budget.status]}</p>
            <p className="text-muted">
              {budget.issued_at
                ? `Emitido el ${formatDate(todayInCordoba(new Date(budget.issued_at)))}`
                : `Al ${formatDate(todayInCordoba(requestTime()))}`}
            </p>
          </div>
        </header>

        {draft && (
          <p className="rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">
            Borrador: los montos siguen los precios de los insumos hasta que se emita.
          </p>
        )}

        <section className="flex flex-col gap-2">
          <h2 className="font-bold">Resumen</h2>
          <SummaryTable totals={totals} currency={budget.currency} className="max-w-xl" />
          <p className="font-mono text-sm text-muted">
            {formatCostPerM2(totals.price_per_m2, budget.currency)} sin IVA · {formatArea(totals.weighted_m2)} ponderados
            {budget.exchange_rate && ` · tipo de cambio ${formatIndexValue(budget.exchange_rate)} pesos por dólar`}
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-bold">Rubros e ítems</h2>
          {chapters
            .filter((c) => c.items.length > 0)
            .map((c, ci) => (
              <table key={c.id} className="print-avoid-break w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-line-strong">
                    <th className="py-1.5 pr-3 text-left font-semibold" colSpan={2}>
                      {ci + 1}. {c.name}
                    </th>
                    <th className="py-1.5 pr-3 text-right font-medium text-muted">Cantidad</th>
                    <th className="py-1.5 pr-3 text-right font-medium text-muted">Unitario</th>
                    <th className="py-1.5 text-right font-medium text-muted">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {c.items.map((i, ii) => (
                    <tr key={i.id} className="border-b border-line align-top">
                      <td className="w-12 py-1.5 pr-2 font-mono text-xs text-muted">
                        {ci + 1}.{ii + 1}
                      </td>
                      <td className="py-1.5 pr-3">{i.description}</td>
                      <td className="py-1.5 pr-3 text-right font-mono whitespace-nowrap">
                        {qty.format(Number(i.quantity))} {i.unit}
                      </td>
                      <td className="py-1.5 pr-3 text-right font-mono whitespace-nowrap">
                        {formatMoney(Math.round((Number(i.cost?.total ?? 0) / Number(i.quantity)) * 100) / 100, budget.currency)}
                      </td>
                      <td className="py-1.5 text-right font-mono whitespace-nowrap">{formatMoney(i.cost?.total ?? 0, budget.currency)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={4} className="py-1.5 pr-3 text-right font-medium">
                      Subtotal {c.name}
                    </td>
                    <td className="py-1.5 text-right font-mono font-semibold whitespace-nowrap">{formatMoney(c.subtotal, budget.currency)}</td>
                  </tr>
                </tbody>
              </table>
            ))}
        </section>

        {overheads.length > 0 && (
          <section className="print-avoid-break flex flex-col gap-2">
            <h2 className="font-bold">Personal e indirectos</h2>
            <table className="w-full border-collapse text-sm">
              <tbody>
                {overheads.map((o) => (
                  <tr key={o.concept} className="border-b border-line">
                    <td className="py-1.5 pr-3">
                      {o.concept} <span className="text-xs text-muted">· {OVERHEAD_KIND_LABEL[o.kind]}</span>
                    </td>
                    <td className="py-1.5 pr-3 text-right font-mono whitespace-nowrap">
                      {formatIndexValue(o.months)} {Number(o.months) === 1 ? "mes" : "meses"} ×{" "}
                      {o.monthly_cost === null ? "sin costo" : formatMoney(o.monthly_cost, budget.currency)}
                    </td>
                    <td className="py-1.5 text-right font-mono whitespace-nowrap">
                      {o.monthly_cost === null
                        ? "—"
                        : formatMoney(Math.round(Number(o.months) * Number(o.monthly_cost) * 100) / 100, budget.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {budget.notes && (
          <section className="flex flex-col gap-1">
            <h2 className="font-bold">Notas</h2>
            <p className="text-sm whitespace-pre-line">{budget.notes}</p>
          </section>
        )}
        <p className="text-xs text-muted">Precios sin IVA, en {budget.currency}. Generado con RP Backoffice.</p>
      </article>
    </>
  );
}
