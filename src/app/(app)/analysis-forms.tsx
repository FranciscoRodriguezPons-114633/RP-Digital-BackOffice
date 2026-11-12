"use client";

import { useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { Field, FormMessage, SubmitButton, useActionForm } from "@/components/form";
import { CHAPTER_SUGGESTIONS, MAX_COMPONENTS, componentCost, unitAnalysisCost, type CostComponent } from "@/lib/analyses";
import { formatMoney, formatUnitPrice } from "@/lib/format";
import { SUPPLY_KIND_LABEL, SUPPLY_UNITS, type SupplyKind } from "@/lib/supplies";
import { parseDecimal, type FormState } from "@/lib/validation";
import {
  createUnitAnalysis,
  deleteUnitAnalysis,
  importCatalogAnalyses,
  saveComponents,
  searchSupplies,
  updateUnitAnalysis,
  type SupplyHit,
} from "./analysis-actions";

export type AnalysisValues = {
  id: string;
  code: string;
  name: string;
  unit: string;
  chapter: string;
  default_waste_pct: string;
  notes: string | null;
};

const plain = (n: string | number) => String(Number(n)).replace(".", ",");

export function UnitAnalysisForm({ analysis, chapters }: { analysis?: AnalysisValues; chapters: string[] }) {
  const action = analysis ? updateUnitAnalysis.bind(null, analysis.id) : createUnitAnalysis;
  const { state, pending, formProps } = useActionForm(action, { resetOnSuccess: false });
  const options = [...new Set([...chapters, ...CHAPTER_SUGGESTIONS])];
  return (
    <form {...formProps} className="grid gap-3 sm:grid-cols-6">
      <Field label="Código" errors={state.errors?.code} className="sm:col-span-2">
        <input name="code" required maxLength={40} defaultValue={analysis?.code} placeholder="MAM-H18" className="input font-mono uppercase" />
      </Field>
      <Field label="Nombre" errors={state.errors?.name} className="sm:col-span-4">
        <input name="name" required minLength={2} maxLength={200} defaultValue={analysis?.name} placeholder="Mampostería de ladrillo hueco 18 cm" className="input" />
      </Field>
      <Field label="Rubro" errors={state.errors?.chapter} className="sm:col-span-3">
        <input name="chapter" required minLength={2} maxLength={80} list="analysis-chapters" defaultValue={analysis?.chapter} placeholder="Mampostería" className="input" />
      </Field>
      <datalist id="analysis-chapters">
        {options.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <Field label="Unidad" errors={state.errors?.unit} className="sm:col-span-1">
        <input name="unit" required maxLength={20} list="analysis-units" defaultValue={analysis?.unit} placeholder="m2" className="input" />
      </Field>
      <datalist id="analysis-units">
        {SUPPLY_UNITS.map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>
      <Field label="Desperdicio habitual de materiales (%)" errors={state.errors?.default_waste_pct} className="sm:col-span-2">
        <input name="default_waste_pct" inputMode="decimal" defaultValue={analysis ? plain(analysis.default_waste_pct) : "5"} className="input" />
      </Field>
      <Field label="Notas (opcional)" errors={state.errors?.notes} className="sm:col-span-6">
        <textarea name="notes" rows={2} maxLength={2000} defaultValue={analysis?.notes ?? ""} placeholder="Qué incluye y qué no." className="input" />
      </Field>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-6">
        <SubmitButton pending={pending} pendingLabel="Guardando…">
          {analysis ? "Guardar cambios" : "Crear y cargar componentes"}
        </SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function DeleteUnitAnalysisForm({ id, name }: { id: string; name: string }) {
  const { state, pending, formProps } = useActionForm(() => deleteUnitAnalysis(id));
  function confirmDelete(event: FormEvent<HTMLFormElement>) {
    if (!window.confirm(`¿Borrar el análisis «${name}» con sus componentes?`)) {
      event.preventDefault();
      return;
    }
    formProps.onSubmit(event);
  }
  return (
    <form {...formProps} onSubmit={confirmDelete} className="flex flex-wrap items-center gap-3">
      <SubmitButton pending={pending} variant="danger" pendingLabel="Borrando…">
        Borrar análisis
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

// ---------- Editor de componentes ----------

export type ComponentRow = {
  supply_id: string;
  code: string;
  name: string;
  kind: SupplyKind;
  unit: string;
  currency: string;
  price: string | null;
  yield: string;
  waste: string;
};

function toCost(r: ComponentRow): CostComponent | null {
  const y = parseDecimal(r.yield);
  const w = parseDecimal(r.waste) ?? 0;
  if (y === null || Number.isNaN(y) || y <= 0 || Number.isNaN(w) || w < 0 || w > 100) return null;
  return { kind: r.kind, currency: r.currency, price: r.price === null ? null : Number(r.price), yield: y, wastePct: w };
}

const signature = (rows: ComponentRow[]) => JSON.stringify(rows.map((r) => [r.supply_id, r.yield, r.waste]));

export function ComponentsEditor({
  analysisId,
  unit,
  defaultWastePct,
  initial,
}: {
  analysisId: string;
  unit: string;
  defaultWastePct: number;
  initial: ComponentRow[];
}) {
  const [rows, setRows] = useState(initial);
  const [saved, setSaved] = useState(() => signature(initial));
  const [state, setState] = useState<FormState>({});
  const [term, setTerm] = useState("");
  const [hits, setHits] = useState<SupplyHit[] | null>(null);
  const [saving, startSaving] = useTransition();
  const [searching, startSearching] = useTransition();

  const costs = rows.map(toCost);
  const invalid = costs.some((c) => c === null);
  const totals = unitAnalysisCost(costs.filter((c): c is CostComponent => c !== null));
  const dirty = signature(rows) !== saved;
  const inList = new Set(rows.map((r) => r.supply_id));

  const edit = (id: string, patch: Partial<ComponentRow>) =>
    setRows((list) => list.map((r) => (r.supply_id === id ? { ...r, ...patch } : r)));

  function add(hit: SupplyHit) {
    setRows((list) => [
      ...list,
      { supply_id: hit.id, code: hit.code, name: hit.name, kind: hit.kind, unit: hit.unit, currency: hit.currency, price: hit.price,
        yield: "", waste: hit.kind === "material" ? plain(defaultWastePct) : "0" },
    ]);
    setState({});
  }

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startSearching(async () => setHits(await searchSupplies(term)));
  }

  function save() {
    const snapshot = signature(rows);
    startSaving(async () => {
      const result = await saveComponents(
        analysisId,
        rows.map((r) => ({ supply_id: r.supply_id, yield: r.yield, waste_pct: r.waste })),
      );
      setState(result);
      if (result.ok) setSaved(snapshot);
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div aria-live="polite" className="grid gap-3 sm:grid-cols-2">
        {totals.length === 0 ? (
          <p className="rounded-lg bg-sunken p-4 text-sm text-muted sm:col-span-2">
            Sumá insumos para ver el costo por {unit}.
          </p>
        ) : (
          totals.map((t) => (
            <div key={t.currency} className="rounded-lg bg-sunken p-4">
              <p className="text-xs text-muted">
                Costo por {unit} en {t.currency}
              </p>
              <p className="font-mono text-2xl font-semibold">{formatMoney(t.total, t.currency)}</p>
              <p className="font-mono text-xs text-muted">
                Materiales {formatMoney(t.materials, t.currency)} · Mano de obra {formatMoney(t.labor, t.currency)} · Equipos{" "}
                {formatMoney(t.equipment, t.currency)}
              </p>
              {t.unpriced > 0 && (
                <p className="mt-1 text-xs text-warn">
                  {t.unpriced === 1 ? "Un insumo sin precio no está sumado" : `${t.unpriced} insumos sin precio no están sumados`}
                </p>
              )}
            </div>
          ))
        )}
      </div>

      {/* `relative`: el encabezado solo para lectores de pantalla queda dentro del área con scroll. */}
      {rows.length > 0 && (
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[680px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left text-muted">
                <th className="py-2 pr-3 font-medium">Insumo</th>
                <th className="py-2 pr-3 font-medium">Rendimiento por {unit}</th>
                <th className="py-2 pr-3 font-medium">Desperdicio %</th>
                <th className="py-2 pr-3 text-right font-medium">Precio</th>
                <th className="py-2 pr-3 text-right font-medium">Costo</th>
                <th className="py-2"><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const cost = costs[i] ? componentCost(costs[i]!) : null;
                return (
                  <tr key={r.supply_id} className="border-b border-line align-top last:border-0">
                    <td className="py-2 pr-3">
                      <Link href={`/insumos/${r.supply_id}`} className="font-medium hover:underline">
                        {r.name}
                      </Link>
                      <span className="block text-xs text-muted">
                        <span className="font-mono">{r.code}</span> · {SUPPLY_KIND_LABEL[r.kind]}
                      </span>
                    </td>
                    <td className="py-2 pr-3">
                      <span className="flex items-center gap-2">
                        <input
                          aria-label={`Rendimiento de ${r.name}`}
                          inputMode="decimal"
                          value={r.yield}
                          onChange={(e) => edit(r.supply_id, { yield: e.target.value })}
                          aria-invalid={costs[i] === null}
                          placeholder="0"
                          className="input w-24 text-right font-mono"
                        />
                        <span className="text-xs text-muted">{r.unit}</span>
                      </span>
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        aria-label={`Desperdicio de ${r.name}`}
                        inputMode="decimal"
                        value={r.waste}
                        onChange={(e) => edit(r.supply_id, { waste: e.target.value })}
                        className="input w-20 text-right font-mono"
                      />
                    </td>
                    <td className="py-2 pr-3 text-right font-mono whitespace-nowrap">
                      {r.price === null ? <span className="font-sans text-warn">Sin precio</span> : formatUnitPrice(r.price, r.currency)}
                    </td>
                    <td className="py-2 pr-3 text-right font-mono whitespace-nowrap">
                      {cost === null ? "—" : formatUnitPrice(Math.round(cost * 100) / 100, r.currency)}
                    </td>
                    <td className="py-1 text-right">
                      <button
                        type="button"
                        onClick={() => setRows((list) => list.filter((x) => x.supply_id !== r.supply_id))}
                        className="btn btn-ghost"
                        aria-label={`Quitar ${r.name}`}
                      >
                        Quitar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={saving || invalid || !dirty} className="btn btn-primary">
          {saving ? "Guardando…" : "Guardar componentes"}
        </button>
        {invalid ? (
          <p className="text-sm text-danger">Completá el rendimiento de cada insumo (mayor que cero) y un desperdicio de 0 a 100.</p>
        ) : dirty && state.ok !== false ? (
          <p className="text-sm text-warn">Hay cambios sin guardar.</p>
        ) : (
          <FormMessage state={state} />
        )}
      </div>

      <div className="flex flex-col gap-3 border-t border-line pt-5">
        <h3 className="text-sm font-medium">Sumar un insumo</h3>
        <form onSubmit={search} className="flex flex-wrap items-end gap-3">
          <label className="field min-w-0 flex-1">
            Buscar por código o nombre
            <input type="search" value={term} onChange={(e) => setTerm(e.target.value)} maxLength={60} placeholder="ladrillo, MO-OFICIAL…" className="input" />
          </label>
          <button type="submit" disabled={searching} className="btn btn-secondary">
            {searching ? "Buscando…" : "Buscar"}
          </button>
        </form>
        {hits !== null &&
          (hits.length === 0 ? (
            <p className="text-sm text-muted">
              No hay insumos que coincidan.{" "}
              <Link href="/insumos" className="underline">
                Cargalo en Insumos
              </Link>
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-line text-sm">
              {hits.map((h) => (
                <li key={h.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                  <span className="font-mono text-xs text-muted">{h.code}</span>
                  <span className="min-w-0 flex-1">{h.name}</span>
                  <span className="font-mono text-xs text-muted">
                    {h.price === null ? "sin precio" : `${formatUnitPrice(h.price, h.currency)}/${h.unit}`}
                  </span>
                  <button
                    type="button"
                    onClick={() => add(h)}
                    disabled={inList.has(h.id) || rows.length >= MAX_COMPONENTS}
                    className="btn btn-secondary"
                    aria-label={`Agregar ${h.name}`}
                  >
                    {inList.has(h.id) ? "Ya está" : "Agregar"}
                  </button>
                </li>
              ))}
            </ul>
          ))}
      </div>
    </div>
  );
}

// ---------- Catálogo ----------

export type CatalogItem = { code: string; name: string; unit: string; chapter: string; note: string | null; components: number };

export function CatalogImportForm({ items }: { items: CatalogItem[] }) {
  const { state, pending, formProps } = useActionForm(importCatalogAnalyses);
  return (
    <form {...formProps} className="flex flex-col gap-3">
      <ul className="flex flex-col divide-y divide-line text-sm">
        {items.map((c) => (
          <li key={c.code} className="py-2">
            <label className="flex items-start gap-3">
              <input type="checkbox" name="codes" value={c.code} className="mt-1" />
              <span className="min-w-0 flex-1">
                <span className="font-medium">{c.name}</span>
                <span className="block text-xs text-muted">
                  <span className="font-mono">{c.code}</span> · {c.chapter} · por {c.unit} · {c.components}{" "}
                  {c.components === 1 ? "insumo" : "insumos"}
                  {c.note && ` · ${c.note}`}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pending={pending} variant="secondary" pendingLabel="Importando…">
          Importar los marcados
        </SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
