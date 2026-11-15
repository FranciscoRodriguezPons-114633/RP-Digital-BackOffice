"use client";

import { useState } from "react";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { openSearch } from "../command-palette";

// Demos interactivas de /sistema: panel, hoja, diálogo, aviso flotante y buscador.
export function OverlayDemos() {
  const [open, setOpen] = useState<null | "right" | "bottom" | "center">(null);
  const toast = useToast();
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" className="btn btn-secondary" onClick={() => setOpen("right")}>Panel lateral</button>
      <button type="button" className="btn btn-secondary" onClick={() => setOpen("bottom")}>Hoja inferior</button>
      <button type="button" className="btn btn-secondary" onClick={() => setOpen("center")}>Diálogo</button>
      <button type="button" className="btn btn-secondary" onClick={() => toast("Orden de cambio enviada a cliente@estudio.test.")}>Aviso</button>
      <button type="button" className="btn btn-secondary" onClick={() => toast("No se pudo guardar: probá de nuevo.", "danger")}>Aviso de error</button>
      <button type="button" className="btn btn-secondary" onClick={openSearch}>Buscador ⌘K</button>

      <Sheet
        open={open === "right"}
        onClose={() => setOpen(null)}
        side="right"
        eyebrow="5 · Revoques"
        title="Agregar ítem"
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setOpen(null)}>Cancelar</button>
            <button type="button" className="btn btn-primary" onClick={() => setOpen(null)}>Agregar ítem</button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <label className="field">
            Descripción
            <input className="input" defaultValue="Revoque grueso interior, pisos 1 a 6" />
          </label>
          <label className="field">
            Cantidad
            <input className="input tabular" inputMode="decimal" defaultValue="4.800" />
          </label>
          <div className="rounded-[var(--radius-control)] bg-sunken p-4">
            <p className="text-sm text-muted">Monto del ítem</p>
            <p className="stat">USD 14.880</p>
          </div>
        </div>
      </Sheet>
      <Sheet open={open === "bottom"} onClose={() => setOpen(null)} side="bottom" title="Más opciones">
        <p className="text-sm text-muted">En el teléfono, los menús salen desde abajo, al alcance del pulgar.</p>
      </Sheet>
      <Sheet
        open={open === "center"}
        onClose={() => setOpen(null)}
        side="center"
        title="¿Anular la OC-003?"
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setOpen(null)}>Volver</button>
            <button type="button" className="btn btn-danger" onClick={() => setOpen(null)}>Anular</button>
          </>
        }
      >
        <p className="text-sm text-subtle">El link que tiene el cliente deja de valer y la orden no suma a los honorarios.</p>
      </Sheet>
    </div>
  );
}
