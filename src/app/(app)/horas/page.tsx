import { Suspense } from "react";
import { CardSkeleton } from "@/components/skeleton";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrg, requireUser } from "@/lib/dal";
import { formatDay, formatHours, recentWindow } from "@/lib/format";
import { idSchema } from "@/lib/validation";
import { SubmitButton } from "@/components/form";
import { deleteTimeEntry } from "../fee-actions";
import { TimeEntryForm, type ProjectStages } from "../fee-forms";

export const metadata: Metadata = { title: "Horas" };

type StageRow = { id: string; name: string; position: number; project_id: string; projects: { name: string; status: string } | null };
type EntryRow = {
  id: string;
  stage_id: string;
  work_date: string;
  hours: string;
  note: string | null;
  fee_stages: { name: string; projects: { name: string } | null } | null;
};

export default function HoursPage({ searchParams }: PageProps<"/horas">) {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-8">
      <h1 className="text-2xl font-semibold">Cargar horas</h1>
      <Suspense fallback={<CardSkeleton lines={4} />}>
        <Hours searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Hours({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const org = await getCurrentOrg();
  if (!org) redirect("/proyectos");

  const params = await searchParams;
  const projectParam = typeof params.proyecto === "string" && idSchema.safeParse(params.proyecto).success ? params.proyecto : null;

  const supabase = await createClient();
  const { today, since } = recentWindow(14);
  const [{ data: stageData }, { data: entryData }] = await Promise.all([
    supabase
      .from("fee_stages")
      .select("id, name, position, project_id, projects(name, status)")
      .eq("org_id", org.id)
      .order("position"),
    supabase
      .from("time_entries")
      .select("id, stage_id, work_date, hours, note, fee_stages(name, projects(name))")
      .eq("user_id", user.id)
      .gte("work_date", since)
      .order("work_date", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);

  const stages = ((stageData ?? []) as unknown as StageRow[]).filter((s) => s.projects?.status !== "archived");
  const entries = (entryData ?? []) as unknown as EntryRow[];

  if (stages.length === 0) {
    return (
      <div className="card text-sm">
        <p>Todavía no hay etapas para cargar horas.</p>
        <p className="mt-2 text-muted">
          El dueño del estudio las crea desde cada proyecto, en <Link href="/proyectos" className="underline">Proyectos</Link>.
        </p>
      </div>
    );
  }

  const groups = new Map<string, ProjectStages>();
  for (const s of stages) {
    const g = groups.get(s.project_id) ?? { projectId: s.project_id, projectName: s.projects?.name ?? "", stages: [] };
    g.stages.push({ id: s.id, name: s.name });
    groups.set(s.project_id, g);
  }
  const sortedGroups = [...groups.values()].sort((a, b) => a.projectName.localeCompare(b.projectName, "es"));

  // Etapa por defecto: la del proyecto pedido o la última que usó la persona.
  const lastUsed = entries.find((e) => stages.some((s) => s.id === e.stage_id))?.stage_id;
  const fromProject = projectParam
    ? (entries.find((e) => stages.find((s) => s.id === e.stage_id)?.project_id === projectParam)?.stage_id ??
       groups.get(projectParam)?.stages[0]?.id)
    : undefined;
  const defaultStageId = fromProject ?? lastUsed ?? sortedGroups[0].stages[0].id;

  const byDay = new Map<string, EntryRow[]>();
  for (const e of entries) byDay.set(e.work_date, [...(byDay.get(e.work_date) ?? []), e]);
  const total = entries.reduce((sum, e) => sum + Number(e.hours), 0);

  return (
    <>
      <section className="card">
        <TimeEntryForm key={defaultStageId} groups={sortedGroups} defaultStageId={defaultStageId} today={today} />
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline gap-3">
          <h2 className="font-medium">Tus últimas dos semanas</h2>
          <span className="ml-auto font-mono text-sm">{formatHours(total)}</span>
        </div>
        {entries.length === 0 ? (
          <p className="text-sm text-muted">Todavía no cargaste horas.</p>
        ) : (
          [...byDay.entries()].map(([day, list]) => (
            <div key={day} className="rounded-lg border border-line bg-surface">
              <div className="flex items-center border-b border-line px-4 py-2 text-sm">
                <span className="font-medium capitalize">{formatDay(day)}</span>
                <span className="ml-auto font-mono text-muted">{formatHours(list.reduce((s, e) => s + Number(e.hours), 0))}</span>
              </div>
              <ul className="divide-y divide-line">
                {list.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm">
                    <span className="font-mono">{formatHours(e.hours)}</span>
                    <span className="min-w-0 flex-1">
                      {e.fee_stages?.projects?.name} · {e.fee_stages?.name}
                      {e.note && <span className="block text-xs text-muted">{e.note}</span>}
                    </span>
                    <form action={deleteTimeEntry.bind(null, e.id)}>
                      <SubmitButton variant="ghost" pendingLabel="…">Borrar</SubmitButton>
                    </form>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>
    </>
  );
}
