"use client";

import { useLayoutEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

// Las dos últimas rutas que mostró la app. Las anota la barra lateral (persiste en el layout).
let currentPath: string | null = null;
let previousPath: string | null = null;

export function useRememberPath(pathname: string) {
  useLayoutEffect(() => {
    if (pathname === currentPath) return;
    previousPath = currentPath;
    currentPath = pathname;
  }, [pathname]);
}

// Cabecera de una sección con pestañas (SPEC-animaciones §2, «pestañas de la misma sección»):
// si se llega desde otra pestaña de la misma sección (`prefix`, por ejemplo /proyectos/<id>),
// el título y las acciones se quedan quietos y solo entra el contenido. Desde otro lugar, la
// cabecera entra completa. En el servidor y al hidratar siempre entra completa.
export function SameSection({
  prefix,
  as: Tag = "div",
  className,
  children,
}: {
  prefix: string;
  as?: "div" | "header";
  className?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [still] = useState(() => {
    if (typeof window === "undefined") return false;
    // Si esta página se renderiza antes de que se confirme la navegación, la ruta anterior
    // todavía es la «actual».
    const from = currentPath !== pathname ? currentPath : previousPath;
    return !!from && (from === prefix || from.startsWith(`${prefix}/`));
  });

  return (
    <Tag className={className} data-still={still || undefined}>
      {children}
    </Tag>
  );
}
