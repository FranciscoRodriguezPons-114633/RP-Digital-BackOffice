import type { ReactNode } from "react";

// Un mismo estado se ve igual en toda la app: color, punto y texto (nunca solo color).
// neutral: borrador o sin novedad · accent: vigente · ok: aprobado o hecho
// warn: espera una acción · danger: rechazado o vencido · info: a futuro, sin urgencia.
export type PillTone = "neutral" | "accent" | "ok" | "warn" | "danger" | "info";

export function StatusPill({
  tone = "neutral",
  struck = false,
  className = "",
  children,
}: {
  tone?: PillTone;
  // Lo que ya no vale (reemplazado, anulado): tachado y sin color.
  struck?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return <span className={`pill ${struck ? "pill-struck" : `pill-${tone}`} ${className}`.trim()}>{children}</span>;
}
