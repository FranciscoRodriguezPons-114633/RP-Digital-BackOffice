"use client";

import { useLayoutEffect, useRef } from "react";
import { usePathname } from "next/navigation";

type Edges = { top: number; bottom: number };

// Pastilla del ítem activo (SPEC-animaciones §3.1). Se pone como primer hijo de un contenedor
// `relative isolate nav-pill-host` que tiene los enlaces; busca el [aria-current="page"] y
// recorta su relleno a ese ítem. Al cambiar de sección, el borde que va adelante llega en
// --dur-lead y el de atrás lo alcanza en --dur-trail: por un instante cubre ambos ítems.
// En el primer montaje y al cambiar de tamaño no viaja.
export function NavPill() {
  const pathname = usePathname();
  const pillRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const last = useRef<Edges | null>(null);

  useLayoutEffect(() => {
    const pill = pillRef.current;
    const fill = fillRef.current;
    const host = pill?.parentElement;
    if (!pill || !fill || !host) return;

    const measure = (): Edges | null => {
      const box = pill.getBoundingClientRect();
      const link = host.querySelector('[aria-current="page"]');
      if (box.height === 0 || !link) return null;
      const r = link.getBoundingClientRect();
      return { top: r.top - box.top, bottom: box.bottom - r.bottom };
    };
    const apply = (edges: Edges, dir: "up" | "down" | "none") => {
      fill.dataset.dir = dir;
      fill.style.setProperty("--pill-top", `${edges.top}px`);
      fill.style.setProperty("--pill-bottom", `${edges.bottom}px`);
      pill.dataset.ready = "";
      last.current = edges;
    };

    const edges = measure();
    if (!edges) {
      // Sin ítem activo (o el menú del teléfono está cerrado): se oculta, no se encoge.
      if (host.querySelector('[aria-current="page"]') === null) pill.dataset.empty = "";
    } else {
      delete pill.dataset.empty;
      const prev = last.current;
      apply(edges, prev === null ? "none" : edges.top > prev.top ? "down" : "up");
    }

    // Otro tamaño (se abre el menú del teléfono, cambia el ancho): vuelve a medir sin viajar.
    const ro = new ResizeObserver(() => {
      const next = measure();
      if (next && (next.top !== last.current?.top || next.bottom !== last.current?.bottom)) apply(next, "none");
    });
    ro.observe(host);
    return () => ro.disconnect();
  }, [pathname]);

  return (
    <div ref={pillRef} className="nav-pill" aria-hidden="true">
      <div ref={fillRef} className="nav-pill__fill" />
    </div>
  );
}
