import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";

// Encabezado de página: volver, título grande, estado, una línea de datos y acciones.
export function PageHeader({
  back,
  title,
  status,
  meta,
  actions,
}: {
  back?: { href: string; label: string };
  title: ReactNode;
  status?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end gap-4">
      <div className="flex min-w-0 grow basis-72 flex-col gap-1.5">
        {back && (
          <Link href={back.href} className="flex w-fit items-center gap-1.5 text-sm text-muted hover:text-foreground">
            <ArrowLeft aria-hidden="true" size={15} />
            {back.label}
          </Link>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{title}</h1>
          {status}
        </div>
        {meta && <p className="text-sm text-muted">{meta}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}
