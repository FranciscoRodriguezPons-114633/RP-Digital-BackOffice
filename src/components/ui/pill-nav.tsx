import Link from "next/link";

// Navegación en pastillas (secciones de un proyecto, filtros por tipo). La activa va oscura.
// countLabel: lo que el número cuenta, para los lectores de pantalla («esperando respuesta»).
export type PillNavItem = { href: string; label: string; count?: number; countLabel?: string; current?: boolean };

export function PillNav({ label, items, className = "" }: { label: string; items: PillNavItem[]; className?: string }) {
  return (
    <nav aria-label={label} className={`-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 ${className}`}>
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={item.current ? "page" : undefined}
          className={`flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm whitespace-nowrap outline-none focus-visible:ring-3 focus-visible:ring-focus ${
            item.current
              ? "bg-foreground font-semibold text-background"
              : "border border-[var(--card-border)] bg-surface text-subtle shadow-[var(--card-shadow)] hover:text-foreground"
          }`}
        >
          {item.label}
          {item.count ? (
            <span className={`tabular text-xs ${item.current ? "opacity-80" : "text-muted"}`}>
              {item.count}
              {item.countLabel && <span className="sr-only"> {item.countLabel}</span>}
            </span>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}
