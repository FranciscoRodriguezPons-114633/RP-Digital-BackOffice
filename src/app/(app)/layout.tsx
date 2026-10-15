import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { getCurrentOrg, getUser } from "@/lib/dal";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-3">
          <Link href="/proyectos" className="font-semibold tracking-tight">
            RP Backoffice
          </Link>
          <nav className="flex gap-4 text-sm">
            <Link href="/proyectos" className="nav-link">Proyectos</Link>
            <Link href="/equipo" className="nav-link">Equipo</Link>
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
