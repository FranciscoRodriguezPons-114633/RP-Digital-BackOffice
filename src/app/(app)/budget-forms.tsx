"use client";

import { createContext, useContext, useState, type FormEvent, type ReactNode } from "react";
import { Field, FormMessage, SubmitButton, useActionForm } from "@/components/form";
import {
  COST_CLASSES,
  COST_CLASS_LABEL,
  ITEM_LEVELS,
  ITEM_LEVEL_HINT,
  itemLine,
  type AnalysisCostRow,
  type CostClass,
} from "@/lib/budgets";
import { formatMoney } from "@/lib/format";
import { BUDGET_LEVEL_LABEL, parseDecimal } from "@/lib/validation";
import {
  addChapter,
  createItemBudget,
  deleteBudgetItem,
  deleteChapter,
  moveBudgetRow,
  renameChapter,
  saveBudgetItem,
  setBudgetExchangeRate,
} from "./budget-actions";

const plain = (n: string | number | null | undefined) => (n === null || n === undefined ? "" : String(Number(n)).replace(".", ","));

export function NewItemBudgetForm({ projectId }: { projectId: string }) {
  const { state, pending, formProps } = useActionForm(createItemBudget.bind(null, projectId), { resetOnSuccess: false });
  return (
    <form {...formProps} className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Tipo</legend>
        {ITEM_LEVELS.map((l, i) => (
          <label key={l} className="flex items-start gap-2 text-sm">
            <input type="radio" name="level" value={l} defaultChecked={i === 0} className="mt-1" />
            <span>
              <span className="font-medium">{BUDGET_LEVEL_LABEL[l]}</span>
              <span className="block text-muted">{ITEM_LEVEL_HINT[l]}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="use_template" defaultChecked />
        Empezar con la plantilla de rubros (se pueden renombrar y borrar)
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pending={pending} pendingLabel="Creando…">
          Crear presupuesto
        </SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function BudgetExchangeRateForm({ projectId, budgetId, rate }: { projectId: string; budgetId: string; rate: string | null }) {
  const { state, pending, formProps } = useActionForm(setBudgetExchangeRate.bind(null, projectId, budgetId), { resetOnSuccess: false });
  return (
    <form {...formProps} className="flex flex-wrap items-start gap-3">
      <Field label="Pesos por dólar" errors={state.errors?.exchange_rate}>
        <input name="exchange_rate" inputMode="decimal" defaultValue={plain(rate)} placeholder="Sin tipo de cambio" className="input w-40" />
      </Field>
      <div className="sm:pt-6">
        <SubmitButton pending={pending} variant="secondary" pendingLabel="Guardando…">
          Guardar
        </SubmitButton>
      </div>
      <div className="w-full">
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function AddChapterForm({ projectId, budgetId }: { projectId: string; budgetId: string }) {
  const { state, pending, formProps } = useActionForm(addChapter.bind(null, projectId, budgetId));
  return (
    <form {...formProps} className="flex flex-wrap items-start gap-3">
      <Field label="Nuevo rubro" errors={state.errors?.name} className="min-w-0 flex-1">
        <input name="name" required minLength={2} maxLength={80} placeholder="Herrería" className="input" />
      </Field>
      <div className="sm:pt-6">
        <SubmitButton pending={pending} variant="secondary" pendingLabel="Agregando…">
          Agregar rubro
        </SubmitButton>
      </div>
      <div className="w-full">
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function RenameChapterForm({
  projectId,
  budgetId,
  chapterId,
  name,
}: {
  projectId: string;
  budgetId: string;
  chapterId: string;
  name: string;
}) {
  const { state, pending, formProps } = useActionForm(renameChapter.bind(null, projectId, budgetId, chapterId), {
    resetOnSuccess: false,
  });
  return (
    <form {...formProps} className="flex flex-wrap items-start gap-3">
      <Field label="Nombre del rubro" errors={state.errors?.name} className="min-w-0 flex-1">
        <input name="name" required minLength={2} maxLength={80} defaultValue={name} className="input" />
      </Field>
      <div className="sm:pt-6">
        <SubmitButton pending={pending} variant="secondary" pendingLabel="Guardando…">
          Renombrar
        </SubmitButton>
      </div>
      <div className="w-full">
        <FormMessage state={state} />
      </div>
    </form>
  );
}

// Borrar un rubro o un ítem, con confirmación; si la base lo frena, el motivo se ve al lado.
export function DeleteRowButton({
  projectId,
  budgetId,
  kind,
  id,
  confirmText,
}: {
  projectId: string;
  budgetId: string;
  kind: "chapter" | "item";
  id: string;
  confirmText: string;
}) {
  const { state, pending, formProps } = useActionForm(() =>
    kind === "chapter" ? deleteChapter(projectId, budgetId, id) : deleteBudgetItem(projectId, budgetId, id),
  );
  function confirmDelete(event: FormEvent<HTMLFormElement>) {
    if (!window.confirm(confirmText)) {
      event.preventDefault();
      return;
    }
    formProps.onSubmit(event);
  }
  return (
    <form {...formProps} onSubmit={confirmDelete} className="flex flex-wrap items-center gap-2">
      <SubmitButton pending={pending} variant="ghost" pendingLabel="…">
        Borrar
      </SubmitButton>
      {state.ok === false && <FormMessage state={state} />}
    </form>
  );
}

export function MoveButtons({
  projectId,
  budgetId,
  kind,
  id,
  label,
  first,
  last,
}: {
  projectId: string;
  budgetId: string;
  kind: "chapter" | "item";
  id: string;
  label: string;
  first: boolean;
  last: boolean;
}) {
  return (
    <span className="inline-flex">
      <form action={moveBudgetRow.bind(null, projectId, budgetId, kind, id, -1)}>
        <button type="submit" disabled={first} className="btn btn-ghost px-2" aria-label={`Subir ${label}`} title="Subir">
          ↑
        </button>
      </form>
      <form action={moveBudgetRow.bind(null, projectId, budgetId, kind, id, 1)}>
        <button type="submit" disabled={last} className="btn btn-ghost px-2" aria-label={`Bajar ${label}`} title="Bajar">
          ↓
        </button>
      </form>
    </span>
  );
}

// ---------- Ítem ----------

export type AnalysisOption = { id: string; code: string; name: string; unit: string; costs: AnalysisCostRow[]; unpriced: number };
export type ItemValues = {
  id: string;
  chapter_id: string;
  description: string;
  unit: string;
  quantity: string;
  analysis_id: string | null;
  unit_price: string | null;
  direct_class: CostClass | null;
  is_subcontract: boolean;
};

// Datos que comparten todos los formularios de ítems del editor. Van una sola vez por página (no
// una copia de la lista de análisis por cada rubro y cada ítem).
type BudgetEditorValue = {
  projectId: string;
  budgetId: string;
  currency: string;
  rate: number | null;
  analyses: AnalysisOption[];
};
const BudgetEditorContext = createContext<BudgetEditorValue | null>(null);

export function BudgetEditorProvider({ value, children }: { value: BudgetEditorValue; children: ReactNode }) {
  return <BudgetEditorContext.Provider value={value}>{children}</BudgetEditorContext.Provider>;
}

export function BudgetItemForm({
  chapterId,
  item,
  defaultMode = "analysis",
}: {
  chapterId: string;
  item?: ItemValues;
  defaultMode?: "analysis" | "direct";
}) {
  const editor = useContext(BudgetEditorContext);
  if (!editor) throw new Error("BudgetItemForm va dentro de BudgetEditorProvider");
  const { projectId, budgetId, currency, rate, analyses } = editor;
  const { state, pending, formProps } = useActionForm(saveBudgetItem.bind(null, projectId, budgetId, item?.id ?? null), {
    resetOnSuccess: !item,
  });
  const [mode, setMode] = useState<"analysis" | "direct">(
    item ? (item.analysis_id ? "analysis" : "direct") : analyses.length === 0 ? "direct" : defaultMode,
  );
  const [analysisId, setAnalysisId] = useState(item?.analysis_id ?? "");
  const [unit, setUnit] = useState(item?.unit ?? "");
  const [quantity, setQuantity] = useState(plain(item?.quantity));
  const [unitPrice, setUnitPrice] = useState(plain(item?.unit_price));
  const [costClass, setCostClass] = useState<CostClass>(item?.direct_class ?? "materials");
  const [subcontract, setSubcontract] = useState(item?.is_subcontract ?? false);
  // Al guardar un ítem nuevo el formulario se vacía: también el estado controlado.
  const [doneFor, setDoneFor] = useState(state);
  if (!item && state !== doneFor) {
    setDoneFor(state);
    if (state.ok) {
      setAnalysisId("");
      setUnit("");
      setQuantity("");
      setUnitPrice("");
      setSubcontract(false);
    }
  }

  const analysis = analyses.find((a) => a.id === analysisId);
  const q = parseDecimal(quantity);
  const price = parseDecimal(unitPrice);
  const preview =
    q !== null && !Number.isNaN(q) && q > 0
      ? mode === "analysis"
        ? analysis
          ? itemLine({ quantity: q, budgetCurrency: currency, rate, isSubcontract: subcontract, analysis: analysis.costs })
          : null
        : price !== null && !Number.isNaN(price) && price > 0
          ? itemLine({ quantity: q, budgetCurrency: currency, rate, isSubcontract: subcontract, direct: { unitPrice: price, costClass } })
          : null
      : null;

  return (
    <form {...formProps} className="grid gap-3 sm:grid-cols-6">
      <input type="hidden" name="chapter_id" value={chapterId} />
      <fieldset className="flex flex-wrap gap-x-5 gap-y-2 sm:col-span-6">
        <legend className="mb-1 text-sm font-medium">Cómo se valoriza</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="mode" value="analysis" checked={mode === "analysis"} onChange={() => setMode("analysis")} disabled={analyses.length === 0} />
          Con un análisis de precios
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="mode" value="direct" checked={mode === "direct"} onChange={() => setMode("direct")} />
          Precio directo
        </label>
      </fieldset>

      {mode === "analysis" ? (
        <Field label="Análisis de precios" errors={state.errors?.analysis_id} className="sm:col-span-6">
          <select
            name="analysis_id"
            value={analysisId}
            onChange={(e) => {
              setAnalysisId(e.target.value);
              const a = analyses.find((x) => x.id === e.target.value);
              if (a && !unit) setUnit(a.unit);
            }}
            className="input"
          >
            <option value="">Elegí uno</option>
            {analyses.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} · {a.name} (por {a.unit})
              </option>
            ))}
          </select>
        </Field>
      ) : (
        <>
          <Field label={`Precio unitario (${currency})`} errors={state.errors?.unit_price} className="sm:col-span-3">
            <input name="unit_price" inputMode="decimal" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} placeholder="1.800.000" className="input" />
          </Field>
          <Field label="Parte del costo" errors={state.errors?.direct_class} className="sm:col-span-3">
            <select name="direct_class" value={costClass} onChange={(e) => setCostClass(e.target.value as CostClass)} className="input">
              {COST_CLASSES.map((c) => (
                <option key={c} value={c}>
                  {COST_CLASS_LABEL[c]}
                </option>
              ))}
            </select>
          </Field>
        </>
      )}

      <Field label="Descripción" errors={state.errors?.description} className="sm:col-span-6">
        <input
          name="description"
          required
          minLength={2}
          maxLength={300}
          defaultValue={item?.description}
          placeholder={mode === "analysis" ? (analysis?.name ?? "Muro de ladrillo hueco 18 cm, planta baja") : "Instalación eléctrica completa"}
          className="input"
        />
      </Field>
      <Field label="Cantidad" errors={state.errors?.quantity} className="sm:col-span-3">
        <input name="quantity" inputMode="decimal" required value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="120" className="input" />
      </Field>
      <Field label="Unidad" errors={state.errors?.unit} className="sm:col-span-3">
        <input name="unit" required maxLength={20} value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="m2" className="input" />
      </Field>
      <label className="flex items-center gap-2 text-sm sm:col-span-6">
        <input type="checkbox" name="is_subcontract" checked={subcontract} onChange={(e) => setSubcontract(e.target.checked)} />
        Lo hace un subcontratista (todo el costo va a subcontratos)
      </label>

      <div aria-live="polite" className="rounded-lg bg-sunken p-3 text-sm sm:col-span-6">
        {preview === null ? (
          <span className="text-muted">Completá la cantidad y el precio para ver el monto.</span>
        ) : preview.missingRate ? (
          <span className="text-warn">El análisis tiene partes en otra moneda: cargá el tipo de cambio del presupuesto.</span>
        ) : (
          <>
            <span className="font-mono font-medium">{formatMoney(preview.total, currency)}</span>
            <span className="text-muted">
              {" "}
              ·{" "}
              {COST_CLASSES.filter((c) => preview.parts[c] > 0)
                .map((c) => `${COST_CLASS_LABEL[c]} ${formatMoney(preview.parts[c], currency)}`)
                .join(" · ")}
            </span>
            {mode === "analysis" && analysis && analysis.unpriced > 0 && (
              <span className="block text-xs text-warn">El análisis tiene insumos sin precio: no están sumados.</span>
            )}
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 sm:col-span-6">
        <SubmitButton pending={pending} pendingLabel="Guardando…">
          {item ? "Guardar ítem" : "Agregar ítem"}
        </SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
