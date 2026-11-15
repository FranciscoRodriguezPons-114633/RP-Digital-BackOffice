import type { ReactNode } from "react";

// Tarjeta de resumen: una etiqueta, un número grande y una línea de contexto.
// tone colorea la línea de contexto; dark invierte la tarjeta para el dato más importante
// (por ejemplo, el resultado del proyecto).
export function StatCard({
  label,
  value,
  hint,
  tone = "muted",
  dark = false,
  children,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "muted" | "ok" | "warn" | "danger";
  dark?: boolean;
  children?: ReactNode;
}) {
  const hintColor = { muted: "text-muted", ok: "text-ok", warn: "text-warn", danger: "text-danger" }[tone];
  return (
    <div
      className={`flex min-w-0 flex-col gap-1.5 rounded-[var(--radius-card)] p-4 sm:p-5 ${
        dark ? "bg-nav text-nav-strong" : "border border-[var(--card-border)] bg-surface shadow-[var(--card-shadow)]"
      }`}
    >
      <p className={`text-xs font-semibold sm:text-sm ${dark ? "text-nav-muted" : "text-muted"}`}>{label}</p>
      <p className="stat">{value}</p>
      {children}
      {hint && <p className={`text-xs sm:text-sm ${dark ? "text-nav-fg" : hintColor} ${tone !== "muted" ? "font-semibold" : ""}`}>{hint}</p>}
    </div>
  );
}
