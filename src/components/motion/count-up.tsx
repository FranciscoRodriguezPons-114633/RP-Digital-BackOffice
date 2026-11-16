"use client";

import { useLayoutEffect, useRef } from "react";
import { formatMoneyLike } from "@/lib/format";
import { easeOutExpo, prefersReducedMotion, readTime } from "./motion";

// Conteo de un importe: de 0 (o del valor anterior, si el dato cambia después de guardar) al
// valor final en --dur-data, con la curva de --ease-data y los decimales del valor final. El
// servidor renderiza el valor final (sin JavaScript, al imprimir o con movimiento reducido se
// ve ese). Los lectores de pantalla leen solo el valor final.
export function CountUp({ value, currency }: { value: number; currency: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef<number | null>(null); // valor en pantalla; null = todavía no se montó
  const final = formatMoneyLike(value, value, currency);

  // Antes de pintar: así nunca se ve el valor final y después el 0.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fmt = (n: number) => formatMoneyLike(n, value, currency);
    const from = shown.current ?? 0;
    if (from === value || prefersReducedMotion()) {
      shown.current = value;
      el.textContent = fmt(value);
      return;
    }
    const duration = readTime(el, "--dur-data");
    const delay = shown.current === null ? readTime(el, "--reveal-data") : 0;
    const start = performance.now() + delay;
    el.textContent = fmt(from);
    let raf = requestAnimationFrame(function tick(now) {
      const p = Math.min(Math.max((now - start) / duration, 0), 1);
      shown.current = from + (value - from) * easeOutExpo(p);
      el.textContent = fmt(p === 1 ? value : shown.current);
      if (p < 1) raf = requestAnimationFrame(tick);
      else shown.current = value;
    });
    // Al imprimir va directo al valor final.
    const finish = () => {
      cancelAnimationFrame(raf);
      shown.current = value;
      el.textContent = fmt(value);
    };
    window.addEventListener("beforeprint", finish);
    return () => {
      window.removeEventListener("beforeprint", finish);
      cancelAnimationFrame(raf);
    };
  }, [value, currency]);

  return (
    <span className="count-up" data-final={final}>
      <span ref={ref} aria-hidden="true">
        {final}
      </span>
      <span className="sr-only">{final}</span>
    </span>
  );
}
