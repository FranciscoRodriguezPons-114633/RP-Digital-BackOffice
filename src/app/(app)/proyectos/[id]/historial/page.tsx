import { Suspense } from "react";
import { PageSkeleton } from "@/components/skeleton";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrg, requireUser } from "@/lib/dal";
import { idSchema } from "@/lib/validation";
import { eventText, type EventRow } from "../event-text";

export const metadata: Metadata = { title: "Historial" };

const PAGE_SIZE = 100;

const dateFmt = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Argentina/Cordoba",
});

export default function HistoryPage({ params, searchParams }: PageProps<"/proyectos/[id]/historial">) {
  return (
    <div className="flex flex-col gap-8">
      <Suspense fallback={<PageSkeleton label="Cargando historial…" list={false} />}>
        <History params={params} searchParams={searchParams} />
      </Suspense>
    </div>
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
  if (!idSchema.safeParse(id).success) notFound();
  await requireUser();
  const page = Math.max(1, Number(typeof query.pagina === "string" ? query.pagina : 1) || 1);

  const supabase = await createClient();
  const [{ data: project }, org] = await Promise.all([
    supabase.from("projects").select("id, org_id, name").eq("id", id).maybeSingle(),
    getCurrentOrg(),
  ]);
  if (!project || org?.id !== project.org_id) notFound();

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
    <>
      <div className="flex flex-col gap-1">
        <Link href={`/proyectos/${id}`} className="text-sm text-muted hover:underline">
          ← {project.name}
        </Link>
        <h1 className="text-2xl font-semibold">Historial</h1>
        <p className="text-sm text-muted">
          {count ?? 0} eventos. El registro no se puede editar ni borrar: queda quién hizo cada cosa y cuándo.
        </p>
      </div>
      <section className="card">
        {events.length === 0 ? (
          <p className="text-sm text-muted">Todavía no hay eventos.</p>
        ) : (
          <ol className="flex flex-col gap-2 text-sm">
            {events.map((e) => (
              <li key={e.id} className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
                <time className="shrink-0 text-muted sm:w-32">{dateFmt.format(new Date(e.created_at))}</time>
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
    </>
  );
}
