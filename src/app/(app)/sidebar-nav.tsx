"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Ellipsis, LogOut, Search } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { ThemeSwitcher } from "@/components/ui/theme-switcher";
import { CommandPalette, openSearch } from "./command-palette";
import { isActivePath, navGroups, type NavGroup, type NavItem } from "./nav-items";

// Navegación de la app. En escritorio, barra lateral oscura fija. En el teléfono, una barra
// superior con la marca y el buscador, y una barra inferior con las secciones de todos los
// días; el resto está en «Más». La sección activa sale de la URL.
export function AppNav({
  orgName,
  email,
  isMember,
  toReview,
  works = false,
}: {
  orgName: string | null;
  email: string;
  isMember: boolean;
  toReview: number;
  // Finanzas de obra habilitadas para la organización (funciones en prueba).
  works?: boolean;
}) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const groups = navGroups({ isMember, works, toReview });
  const all = groups.flatMap((g) => g.items);
  // En la barra inferior: lo que se usa en obra y todos los días.
  const primary = ["/proyectos", works ? "/obras" : "/vencimientos", "/horas"]
    .map((href) => all.find((i) => i.href === href))
    .filter((i): i is NavItem => !!i);
  const moreActive = !primary.some((i) => isActivePath(pathname, i.href));

  return (
    <>
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-5 bg-nav px-3.5 py-5 md:flex">
        <Brand orgName={orgName} />
        <button
          type="button"
          onClick={openSearch}
          className="flex min-h-10 items-center gap-2.5 rounded-[var(--radius-control)] bg-nav-raised px-3 text-sm text-nav-muted outline-none hover:text-nav-strong focus-visible:ring-3 focus-visible:ring-focus"
        >
          <Search aria-hidden="true" size={16} />
          <span className="flex-1 text-left">Buscar</span>
          <kbd className="rounded border border-nav-muted/40 px-1.5 text-[11px] font-sans">⌘K</kbd>
        </button>
        <NavGroups groups={groups} pathname={pathname} />
        <div className="mt-auto flex flex-col gap-3">
          <ThemeSwitcher />
          <UserRow email={email} />
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex items-center gap-2 bg-nav px-4 py-2.5 md:hidden">
        <Brand orgName={orgName} />
        <button
          type="button"
          onClick={openSearch}
          aria-label="Buscar"
          className="ml-auto flex size-11 items-center justify-center rounded-[var(--radius-control)] text-nav-fg outline-none hover:text-nav-strong focus-visible:ring-3 focus-visible:ring-focus"
        >
          <Search aria-hidden="true" size={20} />
        </button>
      </header>

      <nav
        aria-label="Principal"
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {primary.map((item) => (
          <BottomLink key={item.href} item={item} active={isActivePath(pathname, item.href)} />
        ))}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-expanded={moreOpen}
          className={`flex min-h-16 flex-1 flex-col items-center justify-center gap-1 text-[11px] outline-none focus-visible:ring-3 focus-visible:ring-focus ${
            moreActive ? "font-bold text-accent" : "text-muted"
          }`}
        >
          <Ellipsis aria-hidden="true" size={22} />
          Más
        </button>
      </nav>

      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title={orgName ?? "RP Backoffice"} side="bottom">
        <div className="flex flex-col gap-5" onClick={(e) => (e.target as HTMLElement).closest("a") && setMoreOpen(false)}>
          <NavGroups groups={groups} pathname={pathname} light />
          <div className="rounded-[var(--radius-card)] bg-nav p-3">
            <ThemeSwitcher />
          </div>
          <form action="/auth/salir" method="post" className="flex items-center gap-3 text-sm">
            <span className="min-w-0 flex-1 truncate text-muted">{email}</span>
            <button className="btn btn-secondary" type="submit">
              <LogOut aria-hidden="true" size={16} />
              Salir
            </button>
          </form>
        </div>
      </Sheet>

      <CommandPalette groups={groups} />
    </>
  );
}

function NavGroups({ groups, pathname, light = false }: { groups: NavGroup[]; pathname: string; light?: boolean }) {
  return (
    <nav aria-label={light ? "Todas las secciones" : "Principal"} className="flex min-h-0 flex-col gap-5 overflow-y-auto">
      {groups.map((g) => (
        <div key={g.title} className="flex flex-col gap-0.5">
          <span className={`px-3 pb-1.5 text-[11px] font-semibold tracking-wider uppercase ${light ? "text-muted" : "text-nav-muted"}`}>
            {g.title}
          </span>
          {g.items.map((item) => {
            const active = isActivePath(pathname, item.href);
            const Icon = item.icon;
            const color = light
              ? active
                ? "bg-accent-soft font-semibold text-foreground"
                : "text-subtle hover:bg-hover"
              : active
                ? "bg-nav-raised font-semibold text-nav-strong"
                : "text-nav-fg hover:bg-nav-raised/60 hover:text-nav-strong";
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-11 items-center gap-3 rounded-[var(--radius-control)] px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-focus ${color}`}
              >
                <Icon aria-hidden="true" size={18} className={active ? (light ? "text-accent" : "text-nav-accent") : ""} />
                <span className="flex-1">{item.label}</span>
                {item.count ? (
                  <span className="rounded-full bg-[#fbbf24] px-2 text-xs font-bold text-[#0f172a] tabular">
                    {item.count}
                    <span className="sr-only"> pendientes</span>
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function BottomLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`flex min-h-16 flex-1 flex-col items-center justify-center gap-1 text-[11px] outline-none focus-visible:ring-3 focus-visible:ring-focus ${
        active ? "font-bold text-accent" : "text-muted"
      }`}
    >
      <Icon aria-hidden="true" size={22} />
      {item.label}
    </Link>
  );
}

function UserRow({ email }: { email: string }) {
  return (
    <div className="flex items-center gap-2.5 border-t border-nav-raised px-1 pt-3">
      <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-nav-raised text-sm font-bold text-nav-strong">
        {email.charAt(0).toUpperCase()}
      </span>
      <span className="min-w-0 flex-1 truncate text-xs text-nav-muted" title={email}>
        {email}
      </span>
      <form action="/auth/salir" method="post">
        <button
          className="flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-nav-fg outline-none hover:text-nav-strong focus-visible:ring-3 focus-visible:ring-focus"
          type="submit"
        >
          <LogOut aria-hidden="true" size={15} />
          Salir
        </button>
      </form>
    </div>
  );
}

export function Brand({ orgName }: { orgName: string | null }) {
  return (
    <Link href="/proyectos" className="flex min-w-0 items-center gap-2.5 rounded-[var(--radius-control)] px-1.5 outline-none focus-visible:ring-3 focus-visible:ring-focus">
      <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-[#c2410c] text-sm font-extrabold text-white">
        RP
      </span>
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-sm font-bold text-nav-strong">{orgName ?? "RP Backoffice"}</span>
        {orgName && <span className="text-xs text-nav-muted">RP Backoffice</span>}
      </span>
    </Link>
  );
}
