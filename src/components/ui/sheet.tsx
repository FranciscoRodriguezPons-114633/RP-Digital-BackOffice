"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

// Panel lateral, hoja inferior o diálogo centrado, sobre un <dialog> nativo: el navegador
// atrapa el foco adentro, cierra con Escape y deja el resto de la página inerte.
// side="right": crear y editar (en el teléfono ocupa toda la pantalla) · "bottom": menús en
// el teléfono · "center": confirmar.
export function Sheet({
  open,
  onClose,
  title,
  eyebrow,
  side = "right",
  footer,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  eyebrow?: string;
  side?: "right" | "bottom" | "center";
  footer?: ReactNode;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const position = {
    // max-w-none: el navegador le pone a <dialog> un ancho máximo menor que la pantalla.
    right: "ml-auto mr-0 h-dvh max-h-dvh w-full max-w-none sm:w-[440px] rounded-none sm:rounded-l-[var(--radius-card)]",
    bottom: "mt-auto mb-0 w-full max-w-none rounded-t-[var(--radius-card)] max-h-[85dvh]",
    center: "m-auto w-[calc(100%-2rem)] max-w-lg rounded-[var(--radius-card)]",
  }[side];

  return (
    <dialog
      ref={ref}
      aria-label={title}
      onClose={onClose}
      // Clic en el fondo (fuera de la caja) cierra.
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className={`${position} flex-col bg-surface p-0 text-foreground shadow-2xl backdrop:bg-[var(--overlay)] open:flex`}
    >
      <div className="flex items-start gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0 flex-1">
          {eyebrow && <p className="text-xs font-semibold text-muted">{eyebrow}</p>}
          <h2 className="text-lg font-bold">{title}</h2>
        </div>
        <button type="button" onClick={onClose} aria-label="Cerrar" className="btn btn-ghost -mr-2 px-2.5">
          <X aria-hidden="true" size={18} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
      {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-4">{footer}</div>}
    </dialog>
  );
}
