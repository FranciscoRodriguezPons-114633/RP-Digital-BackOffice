"use client";

import { useState, type ReactNode } from "react";

// <details> que solo usa defaultOpen al montarse. Con `open` fijo desde el servidor, React
// lo cerraría en cada recarga en que el valor cambie (por ejemplo, al crear la primera orden),
// y con él se iría el mensaje de "creada".
export function Disclosure({
  defaultOpen,
  summary,
  className,
  summaryClassName,
  children,
}: {
  defaultOpen: boolean;
  summary: ReactNode;
  className?: string;
  summaryClassName?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details className={className} open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className={summaryClassName}>{summary}</summary>
      {children}
    </details>
  );
}
