"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CornerDownLeft, Search } from "lucide-react";
import type { NavGroup } from "./nav-items";
import { searchApp, type SearchResult } from "./search-actions";

// Evento para abrir el buscador desde cualquier botón («Buscar» en la barra lateral o en el teléfono).
export const OPEN_SEARCH_EVENT = "rp:abrir-buscador";
export function openSearch() {
  window.dispatchEvent(new Event(OPEN_SEARCH_EVENT));
}

const plain = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

// Buscador ⌘K: ir a una sección o abrir un proyecto, un insumo, un análisis o un tercero.
// Con las flechas se elige y con Enter se abre.
export function CommandPalette({ groups }: { groups: NavGroup[] }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [active, setActive] = useState(0);
  const [searching, startSearch] = useTransition();

  useEffect(() => {
    const open = () => {
      if (!dialog.current?.open) dialog.current?.showModal();
      input.current?.select();
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (dialog.current?.open) dialog.current.close();
        else open();
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_SEARCH_EVENT, open);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_SEARCH_EVENT, open);
    };
  }, []);

  // Búsqueda en la base, con una pausa corta para no consultar en cada tecla.
  useEffect(() => {
    if (term.trim().length < 2) return;
    const timer = setTimeout(() => startSearch(async () => setResults(await searchApp(term))), 180);
    return () => clearTimeout(timer);
  }, [term]);

  const sections = useMemo(() => {
    const q = plain(term.trim());
    const nav: SearchResult[] = groups
      .flatMap((g) => g.items)
      .filter((i) => !q || plain(`${i.label} ${i.keywords ?? ""}`).includes(q))
      .map((i) => ({ href: i.href, title: i.label, detail: "Ir a la sección", group: "Secciones" }));
    return [...(q.length >= 2 ? results : []), ...nav];
  }, [groups, term, results]);

  function go(item: SearchResult | undefined) {
    if (!item) return;
    dialog.current?.close();
    setTerm("");
    router.push(item.href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, sections.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(sections[active]);
    }
  }

  let lastGroup = "";
  return (
    <dialog
      ref={dialog}
      aria-label="Buscar"
      onClick={(e) => {
        if (e.target === e.currentTarget) dialog.current?.close();
      }}
      onClose={() => setActive(0)}
      className="mx-auto mt-[10dvh] w-[calc(100%-2rem)] max-w-xl overflow-hidden rounded-[var(--radius-card)] bg-surface p-0 text-foreground shadow-2xl backdrop:bg-[var(--overlay)]"
    >
      <div className="flex items-center gap-3 border-b border-line px-4">
        <Search aria-hidden="true" size={18} className="text-muted" />
        <input
          ref={input}
          type="search"
          value={term}
          onChange={(e) => {
            setTerm(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          placeholder="Buscar proyectos, insumos, análisis o secciones"
          aria-label="Buscar"
          aria-controls="buscador-resultados"
          aria-activedescendant={sections[active] ? `buscador-${active}` : undefined}
          className="min-h-14 flex-1 bg-transparent text-base outline-none placeholder:text-muted"
        />
        {searching && <span className="text-xs text-muted">Buscando…</span>}
      </div>
      <ul id="buscador-resultados" role="listbox" aria-label="Resultados" className="max-h-[60dvh] overflow-y-auto p-2">
        {sections.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">No hay resultados para «{term}».</li>}
        {sections.map((item, i) => {
          const header = item.group !== lastGroup ? item.group : null;
          lastGroup = item.group;
          return (
            <li key={`${item.group}-${item.href}-${i}`} role="presentation">
              {header && <p className="px-3 pt-3 pb-1 text-xs font-semibold text-muted">{header}</p>}
              <div
                id={`buscador-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(item)}
                className={`flex cursor-pointer items-center gap-3 rounded-[var(--radius-control)] px-3 py-2.5 ${i === active ? "bg-accent-soft" : ""}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{item.title}</span>
                  <span className="block truncate text-xs text-muted">{item.detail}</span>
                </span>
                {i === active && <CornerDownLeft aria-hidden="true" size={15} className="text-muted" />}
              </div>
            </li>
          );
        })}
      </ul>
    </dialog>
  );
}
