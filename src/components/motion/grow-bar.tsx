"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { IN_VIEW_THRESHOLD } from "./motion";

// Barra horizontal de progreso (SPEC-animaciones §4.3): el relleno crece desde la izquierda con
// clip-path en --dur-bar, cuando entra su tarjeta, de a --stagger-bar por fila (`index`). Si la
// barra está debajo del pliegue, la animación espera pausada hasta que entra en pantalla (§7).
export function GrowBar({
  pct,
  index = 0,
  className = "",
  fillClassName = "",
}: {
  pct: number;
  index?: number;
  className?: string;
  fillClassName?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.some((e) => e.isIntersecting);
        if (visible) {
          delete el.dataset.offscreen;
          io.disconnect();
        } else {
          el.dataset.offscreen = "";
        }
      },
      { threshold: IN_VIEW_THRESHOLD },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className={`h-1.5 overflow-hidden rounded-full bg-line ${className}`} aria-hidden="true">
      <div
        className={`bar-fill h-full rounded-full ${fillClassName}`}
        style={{ width: `${Math.min(Math.max(pct, 0), 100)}%`, "--i": index } as CSSProperties}
      />
    </div>
  );
}
