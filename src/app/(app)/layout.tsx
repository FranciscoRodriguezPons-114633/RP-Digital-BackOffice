import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { getCurrentOrg, getUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:gap-x-6">
          <Link href="/proyectos" className="font-semibold tracking-tight whitespace-nowrap">
            RP Backoffice
          </Link>
          {/* En el teléfono los links van en una segunda fila, para que entren todos. */}
          <nav className="order-last flex w-full flex-wrap gap-x-4 gap-y-1 text-sm sm:order-none sm:w-auto">
            <Link href="/proyectos" className="nav-link">Proyectos</Link>
            <Suspense fallback={null}>
              <TeamLink />
            </Suspense>
          </nav>
          <div className="ml-auto">
            <Suspense fallback={<span className="text-sm text-muted">…</span>}>
              <UserMenu />
            </Suspense>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}

// Los invitados externos no tienen estudio: no ven las secciones internas del estudio.
async function TeamLink() {
  const org = await getCurrentOrg();
  if (!org) return null;
  const supabase = await createClient();
  const { count } = await supabase
    .from("dependencies")
    .select("id", { count: "exact", head: true })
    .eq("org_id", org.id)
    .eq("status", "to_review");
  return (
    <>
      <Link href="/horas" className="nav-link">Horas</Link>
      <Link href="/a-revisar" className="nav-link">
        A revisar
        {count ? <span className="ml-1 rounded-full bg-warn px-1.5 text-xs font-medium text-surface">{count}</span> : null}
      </Link>
      <Link href="/vencimientos" className="nav-link">Vencimientos</Link>
      <Link href="/indices" className="nav-link">Índices</Link>
      <Link href="/recuperado" className="nav-link">Recuperado</Link>
      <Link href="/equipo" className="nav-link">Equipo</Link>
    </>
  );
}

async function UserMenu() {
  const [user, org] = await Promise.all([getUser(), getCurrentOrg()]);
  if (!user) return null;
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="hidden text-muted sm:inline">
        {org ? `${org.name} · ` : ""}
        {user.email}
      </span>
      <form action="/auth/salir" method="post">
        <button className="btn btn-ghost" type="submit">Salir</button>
      </form>
    </div>
  );
}
