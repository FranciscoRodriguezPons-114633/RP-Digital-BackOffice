"use client";

import { useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { THEME_KEY, type Theme } from "../theme-script";

// Selector de tema: automático (según el sistema), claro u oscuro. Se guarda en este
// navegador; el script del layout lo aplica antes de pintar en la próxima carga.
const listeners = new Set<() => void>();

function read(): Theme {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === "light" || t === "dark" ? t : "auto";
  } catch {
    return "auto";
  }
}

function write(theme: Theme) {
  try {
    if (theme === "auto") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Sin almacenamiento (ventana privada estricta): el tema vale hasta recargar.
  }
  if (theme === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", theme);
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const OPTIONS: { value: Theme; label: string; Icon: typeof Sun }[] = [
  { value: "auto", label: "Automático", Icon: Monitor },
  { value: "light", label: "Claro", Icon: Sun },
  { value: "dark", label: "Oscuro", Icon: Moon },
];

export function ThemeSwitcher({ className = "" }: { className?: string }) {
  const theme = useSyncExternalStore(subscribe, read, () => "auto" as Theme);
  return (
    <div role="radiogroup" aria-label="Tema" className={`flex rounded-[var(--radius-control)] bg-nav-raised p-1 ${className}`}>
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={theme === value}
          title={label}
          onClick={() => write(value)}
          className={`flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-lg text-xs font-semibold outline-none focus-visible:ring-3 focus-visible:ring-focus ${
            theme === value ? "bg-nav text-nav-strong" : "text-nav-muted hover:text-nav-strong"
          }`}
        >
          <Icon aria-hidden="true" size={15} />
          <span className="sr-only sm:not-sr-only">{label}</span>
        </button>
      ))}
    </div>
  );
}
