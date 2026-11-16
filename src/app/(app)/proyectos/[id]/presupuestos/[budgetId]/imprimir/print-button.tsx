"use client";

import { Printer } from "lucide-react";

// El navegador imprime o guarda como PDF (en el diálogo de impresión, «Guardar como PDF»).
export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="btn btn-primary">
      <Printer aria-hidden="true" size={16} />
      Imprimir o guardar PDF
    </button>
  );
}
