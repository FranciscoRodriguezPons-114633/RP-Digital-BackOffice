"use client";

import { useLayoutEffect, useRef } from "react";
import { formatAreaLike, formatMoneyLike } from "@/lib/format";
import { IN_VIEW_THRESHOLD, easeOutExpo, prefersReducedMotion, readTime } from "./motion";

type Props =
  | { value: number; format: "money"; currency: string }
  | { value: number; format: "area"; currency?: never };

// Conteo de números (SPEC-animaciones §4.1): de 0 (o del valor anterior, si el dato cambia) al
// valor final en --dur-data, con la curva de --ease-data. Durante el conteo usa el formato del
// valor final (formatMoney / formatArea, es-AR). El servidor renderiza el valor final y el
// conteo arranca mientras el bloque todavía es invisible por su entrada. `format` es un string
// para que se pueda usar desde Server Components.
export function CountUp(props: Props) {
  const { value, format } = props;
  const currency = props.format === "money" ? props.currency : "";
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef<number | null>(null); // valor en pantalla; null = todavía no se montó

  const final = format === "money" ? formatMoneyLike(value, value, currency) : formatAreaLike(value, value);

  // Antes de pintar: así nunca se ve el valor final y después el 0.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fmt = (n: number) => (format === "money" ? formatMoneyLike(n, value, currency) : formatAreaLike(n, value));
    const from = shown.current;
    if (from === value || prefersReducedMotion()) {
      shown.current = value;
      el.textContent = fmt(value);
      return;
    }

    let raf = 0;
    let io: IntersectionObserver | null = null;
    const run = (a: number, delay: number) => {
      const duration = readTime(el, "--dur-data");
      const start = performance.now() + delay;
      raf = requestAnimationFrame(function tick(now) {
        const p = Math.min(Math.max((now - start) / duration, 0), 1);
        shown.current = a + (value - a) * easeOutExpo(p);
        el.textContent = fmt(p === 1 ? value : shown.current);
        if (p < 1) raf = requestAnimationFrame(tick);
        else shown.current = value;
      });
    };

    if (from !== null) {
      // El dato cambió (por ejemplo, después de guardar): sigue desde lo que se ve.
      run(from, 0);
    } else if (!isEntering(el) && isOnScreen(el)) {
      // Se hidrató tarde, con el bloque ya visible: no vuelve a 0 a la vista.
      shown.current = value;
    } else {
      shown.current = 0;
      el.textContent = fmt(0);
      if (isOnScreen(el)) {
        run(0, readTime(el, "--reveal-data"));
      } else {
        // Debajo del pliegue: cuenta cuando entra en pantalla.
        io = new IntersectionObserver(
          (entries) => {
            if (!entries.some((e) => e.isIntersecting)) return;
            io?.disconnect();
            run(0, 0);
          },
          { threshold: IN_VIEW_THRESHOLD },
        );
        io.observe(el);
      }
    }
    // Al imprimir no hay pantalla que mirar: va directo al valor final.
    const finish = () => {
      cancelAnimationFrame(raf);
      io?.disconnect();
      shown.current = value;
      el.textContent = fmt(value);
    };
    window.addEventListener("beforeprint", finish);
    return () => {
      window.removeEventListener("beforeprint", finish);
      cancelAnimationFrame(raf);
      io?.disconnect();
      // Si todavía no había empezado a contar (StrictMode, o se fue antes de verlo), la próxima
      // vez arranca como un montaje nuevo; si iba por la mitad, sigue desde lo que se veía.
      if (shown.current === 0) shown.current = null;
    };
  }, [value, format, currency]);

  return (
    <span className="count-up" data-final={final}>
      <span ref={ref} aria-hidden="true">
        {final}
      </span>
      <span className="sr-only">{final}</span>
    </span>
  );
}

// ¿Algún contenedor todavía está entrando (opacidad < 1 por su animación de entrada)?
function isEntering(el: Element) {
  for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
    if (Number(getComputedStyle(node).opacity) < 1) return true;
  }
  return false;
}

function isOnScreen(el: Element) {
  const r = el.getBoundingClientRect();
  return r.bottom > 0 && r.top < window.innerHeight && r.width > 0;
}
