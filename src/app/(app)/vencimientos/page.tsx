import { Suspense } from "react";
import { PageSkeleton } from "@/components/skeleton";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrg, requireUser } from "@/lib/dal";
import { DeadlineForm } from "../deadline-forms";
import { DEADLINE_SELECT, DeadlineList, type DeadlineRow } from "./deadline-list";

export const metadata: Metadata = { title: "Vencimientos" };

// Server Component: se renderiza una vez por pedido, después de leer cookies.
function requestTime() {
  return new Date();
}

export default function DeadlinesPage() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">Vencimientos</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Las fechas que no se pueden pasar: presentaciones, entregas, permisos o seguros. Te avisamos por correo los días
          que elijas antes de cada una.
        </p>
      </div>
      <Suspense fallback={<PageSkeleton title={false} cards={2} list={false} />}>
        <Deadlines />
      </Suspense>
    </div>
  );
}

async function Deadlines() {
  await requireUser();
  const org = await getCurrentOrg();
  if (!org) redirect("/proyectos");

  const supabase = await createClient();
  const [{ data: pending }, { data: done }, { data: projects }] = await Promise.all([
    supabase.from("deadlines").select(DEADLINE_SELECT).is("done_at", null).order("due_date"),
    supabase.from("deadlines").select(DEADLINE_SELECT).not("done_at", "is", null).order("done_at", { ascending: false }).limit(20),
    supabase.from("projects").select("id, name").eq("org_id", org.id).eq("status", "active").order("name"),
  ]);
  const now = requestTime();

  return (
    <>
      <section className="card">
        <h2 className="mb-4 font-medium">Nuevo vencimiento</h2>
        <DeadlineForm projects={(projects ?? []) as { id: string; name: string }[]} />
      </section>
      <section className="card">
        <h2 className="mb-4 font-medium">Pendientes</h2>
        {(pending ?? []).length === 0 ? (
          <p className="text-sm text-muted">No hay vencimientos pendientes.</p>
        ) : (
          <DeadlineList deadlines={(pending ?? []) as unknown as DeadlineRow[]} showProject now={now} />
        )}
      </section>
      {(done ?? []).length > 0 && (
        <section className="card">
          <h2 className="mb-4 font-medium">Hechos</h2>
          <DeadlineList deadlines={(done ?? []) as unknown as DeadlineRow[]} showProject now={now} />
        </section>
      )}
    </>
  );
}
