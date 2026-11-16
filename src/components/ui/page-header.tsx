import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { RevealText } from "@/components/motion/reveal-title";

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
        {back && <BackLink href={back.href} label={back.label} />}
        <div className="flex flex-wrap items-center gap-3">
          {/* Un título de texto entra letra por letra; uno armado (con links, por ejemplo), quieto. */}
          <h1 className="page-title">{typeof title === "string" ? <RevealText text={title} /> : title}</h1>
          {status}
        </div>
        {meta && <p className="text-sm text-muted">{meta}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

// Volver a la pantalla de arriba (la lista de la que se vino).
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="flex w-fit items-center gap-1.5 text-sm text-muted hover:text-foreground">
      <ArrowLeft aria-hidden="true" size={15} />
      {label}
    </Link>
  );
}
