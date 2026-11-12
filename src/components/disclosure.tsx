"use client";

import { useState, type ReactNode } from "react";

// <details> que solo usa defaultOpen al montarse. Con `open` fijo desde el servidor, React
// lo cerraría en cada recarga en que el valor cambie (por ejemplo, al crear la primera orden),
// y con él se iría el mensaje de "creada".
// `lazy`: el contenido se arma recién la primera vez que se abre (y queda armado). Sirve para
// páginas con muchos desplegables pesados, como los formularios de cada rubro de un presupuesto.
export function Disclosure({
  defaultOpen,
  summary,
  className,
  summaryClassName,
  lazy = false,
  children,
}: {
  defaultOpen: boolean;
  summary: ReactNode;
  className?: string;
  summaryClassName?: string;
  lazy?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [opened, setOpened] = useState(defaultOpen);
  return (
    <details
      className={className}
      open={open}
      onToggle={(e) => {
        setOpen(e.currentTarget.open);
        if (e.currentTarget.open) setOpened(true);
      }}
    >
      <summary className={summaryClassName}>{summary}</summary>
      {(!lazy || opened) && children}
    </details>
  );
}
