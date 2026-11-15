// Barra de avance. El color sale del porcentaje: verde hasta 79 %, ámbar desde 80 % y
// rojo desde 100 % (los mismos umbrales que los avisos de horas). El texto lo pone quien la usa.
export function progressTone(pct: number | null) {
  if (pct === null) return "neutral" as const;
  if (pct >= 100) return "danger" as const;
  if (pct >= 80) return "warn" as const;
  return "ok" as const;
}

export function ProgressBar({
  pct,
  size = "md",
  tone,
  className = "",
}: {
  pct: number | null;
  size?: "sm" | "md" | "lg";
  tone?: "neutral" | "ok" | "warn" | "danger" | "accent";
  className?: string;
}) {
  const t = tone ?? progressTone(pct);
  const color = { neutral: "bg-foreground", ok: "bg-ok", warn: "bg-warn", danger: "bg-danger", accent: "bg-accent" }[t];
  const height = { sm: "h-1.5", md: "h-2", lg: "h-3" }[size];
  const width = pct === null ? 0 : Math.min(Math.max(pct, 0), 100);
  return (
    <div aria-hidden="true" className={`${height} overflow-hidden rounded-full bg-line ${className}`}>
      {width > 0 && <div className={`${height} rounded-full ${color}`} style={{ width: `${Math.max(width, 2)}%` }} />}
    </div>
  );
}
