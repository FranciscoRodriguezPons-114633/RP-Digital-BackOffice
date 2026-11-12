"use client";

import { useLayoutEffect, useRef } from "react";

type Edges = { group: string; left: number; right: number };

// Las pestañas viven dentro de cada page.tsx y se vuelven a montar en cada navegación: la
// posición anterior se guarda acá, a nivel de módulo, para que el subrayado viaje.
let lastEdges: Edges | null = null;

// Subrayado de pestañas (SPEC-animaciones §3.2): el mismo estiramiento que la pastilla, en
// horizontal. Va como hijo de un contenedor `relative tabs-host` con los enlaces; mide el
// [aria-current="page"] y queda ~8 px más ancho que la etiqueta. `group` identifica el juego de
// pestañas (el proyecto): solo viaja entre pestañas del mismo grupo.
export function TabUnderline({ group }: { group: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const line = ref.current;
    const host = line?.parentElement;
    if (!line || !host) return;

    const measure = (): Edges | null => {
      const box = line.getBoundingClientRect();
      const tab = host.querySelector('[aria-current="page"]');
      if (box.width === 0 || !tab) return null;
      const r = tab.getBoundingClientRect();
      // La pestaña tiene 12 px de relleno a cada lado; la línea queda a 4 px del borde.
      const inset = Math.max(0, Number.parseFloat(getComputedStyle(tab).paddingLeft) - 8);
      return { group, left: r.left - box.left + inset, right: box.right - r.right + inset };
    };
    const apply = (edges: Edges, dir: "left" | "right" | "none") => {
      line.dataset.dir = dir;
      line.style.setProperty("--ul-left", `${edges.left}px`);
      line.style.setProperty("--ul-right", `${edges.right}px`);
      line.dataset.ready = "";
      lastEdges = edges;
    };

    const edges = measure();
    if (edges) {
      const prev = lastEdges;
      if (prev && prev.group === group && prev.left !== edges.left) {
        // Arranca donde estaba la pestaña anterior y viaja hasta la nueva.
        apply(prev, "none");
        getComputedStyle(line).getPropertyValue("--ul-left"); // fija el punto de partida
        apply(edges, edges.left > prev.left ? "right" : "left");
      } else if (!(line.dataset.ready !== undefined && prev && prev.left === edges.left && prev.right === edges.right)) {
        // (Si ya está ahí, por ejemplo al repetir el efecto en StrictMode, no corta el viaje.)
        apply(edges, "none");
      }
    }

    const ro = new ResizeObserver(() => {
      const next = measure();
      if (next && (next.left !== lastEdges?.left || next.right !== lastEdges?.right)) apply(next, "none");
    });
    ro.observe(host);
    return () => ro.disconnect();
  }, [group]);

  return <span ref={ref} className="tab-underline" aria-hidden="true" />;
}
