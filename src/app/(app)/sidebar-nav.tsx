"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type IconName = "projects" | "review" | "calendar" | "clock" | "chart" | "trend" | "team" | "plan";

type NavItem = { href: string; label: string; icon: IconName; count?: number };

// Barra lateral: en escritorio queda fija a la izquierda; en el teléfono es una barra
// superior y el menú se abre con un botón. La sección activa sale de la URL.
export function SidebarNav({
  orgName,
  email,
  isMember,
  toReview,
}: {
  orgName: string | null;
  email: string;
  isMember: boolean;
  toReview: number;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Los invitados externos no tienen estudio: solo ven sus proyectos.
  const groups: { title: string; items: NavItem[] }[] = isMember
    ? [
        {
          title: "Trabajo",
          items: [
            { href: "/proyectos", label: "Proyectos", icon: "projects" },
            { href: "/a-revisar", label: "A revisar", icon: "review", count: toReview },
            { href: "/vencimientos", label: "Vencimientos", icon: "calendar" },
            { href: "/horas", label: "Horas", icon: "clock" },
          ],
        },
        {
          title: "Finanzas",
          items: [
            { href: "/recuperado", label: "Recuperado", icon: "chart" },
            { href: "/indices", label: "Índices", icon: "trend" },
          ],
        },
        {
          title: "Estudio",
          items: [
            { href: "/equipo", label: "Equipo", icon: "team" },
            { href: "/plan", label: "Plan", icon: "plan" },
          ],
        },
      ]
    : [{ title: "Trabajo", items: [{ href: "/proyectos", label: "Proyectos", icon: "projects" }] }];

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="flex flex-col md:h-full">
      <div className="flex items-center gap-3 px-4 py-3 md:px-5 md:pt-5 md:pb-4">
        <Brand orgName={orgName} />
        <button
          type="button"
          className="btn btn-secondary btn-sm ml-auto md:hidden"
          aria-expanded={open}
          aria-controls="app-nav"
          onClick={() => setOpen((v) => !v)}
        >
          <Icon name={open ? "close" : "menu"} />
          Menú
        </button>
      </div>

      <div id="app-nav" className={`${open ? "flex" : "hidden"} min-h-0 flex-1 flex-col md:flex`}>
        <nav aria-label="Principal" className="flex flex-col gap-5 overflow-y-auto px-3 pb-4">
          {groups.map((g) => (
            <div key={g.title} className="flex flex-col gap-0.5">
              <span className="px-2.5 pb-1.5 text-[11px] font-semibold tracking-wider text-muted uppercase">{g.title}</span>
              {g.items.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setOpen(false)}
                    className={`flex min-h-10 items-center gap-2.5 rounded-lg px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-focus ${
                      active
                        ? "bg-surface font-medium text-foreground shadow-[0_1px_0_var(--line)]"
                        : "text-subtle hover:bg-surface/60 hover:text-foreground"
                    }`}
                  >
                    <span className={active ? "text-accent" : "text-muted"}>
                      <Icon name={item.icon} />
                    </span>
                    <span className="flex-1">{item.label}</span>
                    {item.count ? (
                      <span className="rounded-full bg-warn-soft px-2 text-xs font-semibold text-warn">
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

        <div className="mt-auto flex items-center gap-2.5 border-t border-line px-5 py-4">
          <span
            aria-hidden="true"
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-line text-sm font-semibold text-subtle"
          >
            {email.charAt(0).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1 truncate text-xs text-muted" title={email}>
            {email}
          </span>
          <form action="/auth/salir" method="post">
            <button className="btn btn-ghost btn-sm" type="submit">Salir</button>
          </form>
        </div>
      </div>
    </div>
  );
}

export function Brand({ orgName }: { orgName: string | null }) {
  return (
    <Link href="/proyectos" className="flex min-w-0 items-center gap-2.5 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-focus">
      <span
        aria-hidden="true"
        className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent font-mono text-xs font-medium text-[var(--accent-fg)]"
      >
        RP
      </span>
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-sm font-semibold">{orgName ?? "RP Backoffice"}</span>
        {orgName && <span className="text-xs text-muted">RP Backoffice</span>}
      </span>
    </Link>
  );
}

const PATHS: Record<IconName | "menu" | "close", string> = {
  projects: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  review: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  calendar: "M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM3 10h18M8 3v4M16 3v4",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  trend: "M3 17l6-6 4 4 8-8M15 7h6v6",
  team: "M9 4.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5",
  plan: "M5 6h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2zM3 10h18",
  menu: "M4 7h16M4 12h16M4 17h16",
  close: "M6 6l12 12M18 6L6 18",
};

function Icon({ name }: { name: IconName | "menu" | "close" }) {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={PATHS[name]} />
    </svg>
  );
}
