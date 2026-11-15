import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

// Lista vacía: qué es esto, por qué está vacío y la acción para empezar.
export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[var(--radius-card)] border border-dashed border-line-strong px-6 py-10 text-center">
      <span className="flex size-12 items-center justify-center rounded-[var(--radius-control)] bg-accent-soft text-accent">
        <Icon aria-hidden="true" size={22} />
      </span>
      <h2 className="text-base font-bold">{title}</h2>
      {children && <p className="max-w-md text-sm text-muted">{children}</p>}
      {action}
    </div>
  );
}
