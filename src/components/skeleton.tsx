import type { ReactNode } from "react";

// Esqueletos de carga: muestran la forma del bloque que va a llegar, así la página no salta
// cuando aparecen los datos. El texto oculto avisa a los lectores de pantalla.

export function Skeleton({ className = "" }: { className?: string }) {
  return <span aria-hidden="true" className={`skeleton ${className}`} />;
}

function Loading({ label, className = "", children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div role="status" className={className || undefined}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

const LINE_WIDTHS = ["w-3/4", "w-1/2", "w-2/3", "w-5/12", "w-7/12"];

function CardShape({ lines }: { lines: number }) {
  return (
    <div className="card flex flex-col gap-4">
      <Skeleton className="h-5 w-40" />
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={`h-4 ${LINE_WIDTHS[i % LINE_WIDTHS.length]}`} />
      ))}
    </div>
  );
}

// Misma forma que las listas con borde (proyectos, equipo, a revisar…).
function ListShape({ rows }: { rows: number }) {
  return (
    <div className="divide-y divide-line rounded-xl border border-line bg-surface">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3">
          <Skeleton className={`h-4 ${i % 2 ? "w-36" : "w-48"}`} />
          <Skeleton className="h-3 w-14" />
          <Skeleton className="ml-auto h-3 w-24" />
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton({ label = "Cargando…", lines = 3 }: { label?: string; lines?: number }) {
  return (
    <Loading label={label}>
      <CardShape lines={lines} />
    </Loading>
  );
}

export function ListSkeleton({ label = "Cargando…", rows = 4 }: { label?: string; rows?: number }) {
  return (
    <Loading label={label}>
      <ListShape rows={rows} />
    </Loading>
  );
}

// Página entera: título opcional, tarjetas y una lista al final.
export function PageSkeleton({
  label = "Cargando…",
  title = true,
  cards = 1,
  list = true,
}: {
  label?: string;
  title?: boolean;
  cards?: number;
  list?: boolean;
}) {
  return (
    <Loading label={label} className="flex flex-col gap-8">
      {title && (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-40" />
        </div>
      )}
      {Array.from({ length: cards }, (_, i) => (
        <CardShape key={i} lines={3} />
      ))}
      {list && <ListShape rows={4} />}
    </Loading>
  );
}
