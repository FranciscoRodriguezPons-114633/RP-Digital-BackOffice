"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { Sheet } from "./sheet";
import { useToast } from "./toast";

// Un formulario dentro de un PanelButton avisa acá cuando guardó bien (lo hace useActionForm).
const PanelContext = createContext<{ saved: (message?: string) => void } | null>(null);
export const usePanel = () => useContext(PanelContext);

// Botón que abre un panel lateral con un formulario (crear o editar). El contenido se arma al
// abrir y se desarma al cerrar: cada vez arranca limpio y la página no carga formularios que
// nadie abrió. Al guardar bien, el panel se cierra y el mensaje de la acción sale en un aviso;
// con closeOnSuccess={false} se queda abierto (por ejemplo, para copiar el link de una orden).
export function PanelButton({
  label,
  title,
  eyebrow,
  icon,
  variant = "secondary",
  size,
  className = "",
  defaultOpen = false,
  closeOnSuccess = true,
  children,
}: {
  label: ReactNode;
  // Título del panel; si el botón dice algo distinto (o es un ícono), va acá.
  title: string;
  eyebrow?: string;
  icon?: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "dashed";
  size?: "sm";
  className?: string;
  // Abierto al llegar (por ejemplo, desde un link que pide crear una orden para una etapa).
  defaultOpen?: boolean;
  closeOnSuccess?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const toast = useToast();
  const panel = useMemo(
    () => ({
      saved: (message?: string) => {
        if (!closeOnSuccess) return;
        setOpen(false);
        if (message) toast(message);
      },
    }),
    [closeOnSuccess, toast],
  );
  const look =
    variant === "dashed"
      ? "btn w-full justify-start border-dashed border-line-strong bg-transparent text-foreground hover:bg-hover"
      : `btn btn-${variant}`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`${look} ${size === "sm" ? "btn-sm" : ""} ${className}`.trim()}
      >
        {icon}
        {label}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={title} eyebrow={eyebrow}>
        {open && <PanelContext.Provider value={panel}>{children}</PanelContext.Provider>}
      </Sheet>
    </>
  );
}
