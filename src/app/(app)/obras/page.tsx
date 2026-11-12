import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PageSkeleton } from "@/components/skeleton";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrg, hasWorks, requireUser } from "@/lib/dal";
import { formatArea } from "@/lib/format";
import { WORK_ROLE_SHORT, type WorkRole } from "@/lib/validation";
import { CountUp } from "@/components/motion/count-up";
import { PageTransition } from "@/components/motion/page-transition";
import { RevealTitle } from "@/components/motion/reveal-title";
import { revealFrom } from "@/components/motion/reveal";

export const metadata: Metadata = { title: "Obras" };

export default function WorksPage() {
  return (
    <PageTransition className="flex flex-col gap-8">
      <div>
        <RevealTitle text="Obras" />
        <p className="reveal-fade mt-1 text-sm text-muted">Los proyectos con ficha de obra y su última estimación de costo.</p>
      </div>
      <Suspense fallback={<PageSkeleton label="Cargando obras…" title={false} cards={0} />}>
        <Works />
      </Suspense>
    </PageTransition>
  );
}

type WorkRow = {
  project_id: string;
  org_role: WorkRole;
  city: string | null;
  covered_m2: string;
  projects: { name: string; code: string | null; status: string } | null;
};
type TotalRow = { project_id: string; number: number; total: string; currency: string };

async function Works() {
  await requireUser();
  const org = await getCurrentOrg();
  if (!hasWorks(org)) notFound();

  const supabase = await createClient();
  const [{ data: works }, { data: totals }] = await Promise.all([
    supabase
      .from("works")
      .select("project_id, org_role, city, covered_m2, projects(name, code, status)")
      .order("created_at", { ascending: false }),
    supabase.from("budget_totals").select("project_id, number, total, currency").order("number", { ascending: false }),
  ]);
  const rows = (works ?? []) as unknown as WorkRow[];
  // La consulta viene ordenada por versión descendente: la primera de cada proyecto es la última.
  const latest = new Map<string, TotalRow>();
  for (const t of (totals ?? []) as TotalRow[]) if (!latest.has(t.project_id)) latest.set(t.project_id, t);

  if (rows.length === 0) {
    return (
      <section className="card reveal flex flex-col items-start gap-3">
        <h2 className="font-medium">Todavía no hay obras</h2>
        <p className="text-sm text-muted">Entrá a un proyecto, abrí la pestaña «Obra» y completá la ficha.</p>
        <Link href="/proyectos" className="btn btn-primary">Ir a proyectos</Link>
      </section>
    );
  }

  return (
    <ul className="card reveal reveal-group flex flex-col divide-y divide-line p-0" style={revealFrom(1)}>
      {rows.map((w) => {
        const t = latest.get(w.project_id);
        return (
          <li key={w.project_id}>
            <Link
              href={`/proyectos/${w.project_id}/obra`}
              className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-6 py-4 outline-none hover:bg-hover focus-visible:ring-3 focus-visible:ring-focus"
            >
              <span className="min-w-0 flex-1">
                <span className="font-medium">{w.projects?.name}</span>
                <span className="ml-2 text-sm text-muted">
                  {[WORK_ROLE_SHORT[w.org_role], w.city].filter(Boolean).join(" · ")}
                </span>
              </span>
              <span className="font-mono text-sm text-muted">{formatArea(w.covered_m2)}</span>
              <span className="w-40 text-right font-mono whitespace-nowrap">
                {t ? <CountUp value={Number(t.total)} format="money" currency={t.currency} /> : <span className="text-sm text-muted">Sin estimar</span>}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
