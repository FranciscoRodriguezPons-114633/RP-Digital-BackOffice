import { Suspense } from "react";
import { PageSkeleton } from "@/components/skeleton";
import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { eventText, type EventRow } from "../event-text";
import { loadMemberProject } from "../project-header";

export const metadata: Metadata = { title: "Actividad" };

const PAGE_SIZE = 100;

const dateFmt = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Argentina/Cordoba",
});

export default function HistoryPage({ params, searchParams }: PageProps<"/proyectos/[id]/historial">) {
  return (
    <Suspense fallback={<PageSkeleton label="Cargando actividad…" title={false} list={false} />}>
      <History params={params} searchParams={searchParams} />
    </Suspense>
  );
}

// Todo lo que pasó en el proyecto, del registro de eventos (que no se puede editar ni borrar):
// quién aprobó qué, qué se publicó, qué se envió y a quién.
async function History({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  await loadMemberProject(id);
  const page = Math.max(1, Number(typeof query.pagina === "string" ? query.pagina : 1) || 1);

  const supabase = await createClient();

  const from = (page - 1) * PAGE_SIZE;
  const { data, count } = await supabase
    .from("events")
    .select("id, type, actor_email, data, created_at", { count: "exact" })
    .or(`entity_id.eq.${id},data->>project_id.eq.${id}`)
    .order("created_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);
  const events = (data ?? []) as EventRow[];
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-4">
      <section className="card flex flex-col gap-4" aria-labelledby="actividad">
        <div>
          <h2 id="actividad" className="font-bold">Actividad</h2>
          <p className="mt-1 text-sm text-muted">
            {count ?? 0} eventos. El registro no se puede editar ni borrar: queda quién hizo cada cosa y cuándo.
          </p>
        </div>
        {events.length === 0 ? (
          <p className="text-sm text-muted">Todavía no hay eventos.</p>
        ) : (
          <ol className="flex flex-col gap-2 text-sm">
            {events.map((e) => (
              <li key={e.id} className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
                <time dateTime={e.created_at} className="shrink-0 text-muted sm:w-32">
                  {dateFmt.format(new Date(e.created_at))}
                </time>
                <span>{eventText(e)}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
      {pages > 1 && (
        <nav className="flex items-center gap-3 text-sm">
          {page > 1 && <Link href={`?pagina=${page - 1}`} className="underline">Más nuevos</Link>}
          <span className="text-muted">Página {page} de {pages}</span>
          {page < pages && <Link href={`?pagina=${page + 1}`} className="underline">Más viejos</Link>}
        </nav>
      )}
    </div>
  );
}
