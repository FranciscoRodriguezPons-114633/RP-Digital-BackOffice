"use client";

import { useState } from "react";
import { FieldError, FormMessage, SubmitButton, useActionForm } from "@/components/form";
import { formatArea, formatCostPerM2, formatMoney, parametricEstimate } from "@/lib/format";
import {
  CURRENCIES,
  ORG_KINDS,
  ORG_KIND_LABEL,
  QUALITIES,
  QUALITY_LABEL,
  TYPOLOGIES,
  TYPOLOGY_LABEL,
  WORK_ROLES,
  WORK_ROLE_LABEL,
  parseDecimal,
  type OrgKind,
  type Quality,
  type Typology,
  type WorkRole,
} from "@/lib/validation";
import { createParametricBudget, saveWork, setOrganizationKind } from "./work-actions";

export type WorkValues = {
  org_role: WorkRole;
  address: string | null;
  city: string | null;
  covered_m2: string;
  semicovered_m2: string;
  typology: Typology;
  quality: Quality;
  planned_start: string | null;
  planned_end: string | null;
  currency: string;
};

// Los números de la base ("2400.00") se muestran como los escribe la gente ("2400").
function plain(n: string | null | undefined) {
  return n === null || n === undefined ? "" : String(Number(n)).replace(".", ",");
}

export function WorkForm({ projectId, work }: { projectId: string; work: WorkValues | null }) {
  const { state, pending, formProps } = useActionForm(saveWork.bind(null, projectId), { resetOnSuccess: false });
  return (
    <form {...formProps} className="grid grid-cols-1 gap-4 sm:grid-cols-6">
      <fieldset className="flex flex-col gap-2 sm:col-span-6">
        <legend className="mb-1 text-sm font-medium">Qué papel cumplen en la obra</legend>
        {WORK_ROLES.map((r) => (
          <label key={r} className="flex items-center gap-2 text-sm">
            <input type="radio" name="org_role" value={r} defaultChecked={work?.org_role === r} required />
            {WORK_ROLE_LABEL[r]}
          </label>
        ))}
        <FieldError errors={state.errors?.org_role} />
      </fieldset>

      <label className="field sm:col-span-4">
        Dirección
        <input name="address" maxLength={200} defaultValue={work?.address ?? ""} placeholder="Av. Hipólito Yrigoyen 450" className="input" />
      </label>
      <label className="field sm:col-span-2">
        Ciudad
        <input name="city" maxLength={120} defaultValue={work?.city ?? ""} placeholder="Córdoba" className="input" />
      </label>

      <label className="field sm:col-span-2">
        m² cubiertos
        <input name="covered_m2" inputMode="decimal" required defaultValue={plain(work?.covered_m2)} placeholder="2400" className="input" />
      </label>
      <label className="field sm:col-span-2">
        m² semicubiertos
        <input name="semicovered_m2" inputMode="decimal" defaultValue={plain(work?.semicovered_m2)} placeholder="0" className="input" />
      </label>
      <label className="field sm:col-span-2">
        Moneda
        <select name="currency" defaultValue={work?.currency ?? "USD"} className="input">
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>

      <label className="field sm:col-span-3">
        Tipología
        <select name="typology" defaultValue={work?.typology ?? ""} required className="input">
          <option value="" disabled>
            Elegí una
          </option>
          {TYPOLOGIES.map((t) => (
            <option key={t} value={t}>
              {TYPOLOGY_LABEL[t]}
            </option>
          ))}
        </select>
      </label>
      <label className="field sm:col-span-3">
        Calidad
        <select name="quality" defaultValue={work?.quality ?? "standard"} required className="input">
          {QUALITIES.map((q) => (
            <option key={q} value={q}>
              {QUALITY_LABEL[q]}
            </option>
          ))}
        </select>
      </label>

      <label className="field sm:col-span-3">
        Inicio previsto
        <input name="planned_start" type="date" defaultValue={work?.planned_start ?? ""} className="input" />
      </label>
      <label className="field sm:col-span-3">
        Fin previsto
        <input name="planned_end" type="date" defaultValue={work?.planned_end ?? ""} className="input" />
      </label>

      <div className="flex flex-col gap-1 sm:col-span-6">
        <FieldError errors={state.errors?.covered_m2} />
        <FieldError errors={state.errors?.semicovered_m2} />
        <FieldError errors={state.errors?.typology} />
        <FieldError errors={state.errors?.planned_end} />
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-6">
        <SubmitButton pending={pending} pendingLabel="Guardando…">
          {work ? "Guardar cambios" : "Guardar ficha"}
        </SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function ParametricBudgetForm({
  projectId,
  work,
  typologyCoef,
  qualityCoef,
  today,
}: {
  projectId: string;
  work: Pick<WorkValues, "covered_m2" | "semicovered_m2" | "typology" | "quality" | "currency">;
  typologyCoef: string;
  qualityCoef: string;
  // YYYY-MM-DD en Córdoba, calculado en el servidor.
  today: string;
}) {
  // No se vacía al guardar: lo habitual es probar otra versión cambiando un solo dato.
  const { state, pending, formProps } = useActionForm(createParametricBudget.bind(null, projectId), {
    resetOnSuccess: false,
  });
  const [values, setValues] = useState({
    reference_cost_m2: "",
    semicovered_factor: "0,5",
    typology_coef: plain(typologyCoef),
    quality_coef: plain(qualityCoef),
  });
  const set = (k: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((v) => ({ ...v, [k]: e.target.value }));

  const n = {
    cost: parseDecimal(values.reference_cost_m2),
    factor: parseDecimal(values.semicovered_factor),
    typ: parseDecimal(values.typology_coef),
    qual: parseDecimal(values.quality_coef),
  };
  const ready = Object.values(n).every((v) => v !== null && !Number.isNaN(v) && v >= 0) && (n.cost ?? 0) > 0;
  const estimate = ready
    ? parametricEstimate({
        coveredM2: Number(work.covered_m2),
        semicoveredM2: Number(work.semicovered_m2),
        semicoveredFactor: n.factor!,
        referenceCostM2: n.cost!,
        typologyCoef: n.typ!,
        qualityCoef: n.qual!,
      })
    : null;

  return (
    <form {...formProps} className="grid grid-cols-1 gap-4 sm:grid-cols-6">
      <label className="field sm:col-span-2">
        Costo de referencia por m² ({work.currency})
        <input
          name="reference_cost_m2"
          inputMode="decimal"
          required
          value={values.reference_cost_m2}
          onChange={set("reference_cost_m2")}
          placeholder="1.503"
          className="input"
        />
      </label>
      <label className="field sm:col-span-2">
        Fecha del costo
        <input name="reference_date" type="date" required defaultValue={today} className="input" />
      </label>
      <label className="field sm:col-span-2">
        De dónde sale
        <input name="reference_source" required minLength={2} maxLength={200} placeholder="Costo propio, revista, cámara…" className="input" />
      </label>

      <label className="field sm:col-span-2">
        Factor de semicubiertos
        <input name="semicovered_factor" inputMode="decimal" value={values.semicovered_factor} onChange={set("semicovered_factor")} className="input" />
      </label>
      <label className="field sm:col-span-2">
        Coef. {TYPOLOGY_LABEL[work.typology].toLowerCase()}
        <input name="typology_coef" inputMode="decimal" value={values.typology_coef} onChange={set("typology_coef")} className="input" />
      </label>
      <label className="field sm:col-span-2">
        Coef. calidad {QUALITY_LABEL[work.quality].toLowerCase()}
        <input name="quality_coef" inputMode="decimal" value={values.quality_coef} onChange={set("quality_coef")} className="input" />
      </label>
      <p className="-mt-2 text-xs text-muted sm:col-span-6">
        Los coeficientes son orientativos: cambialos si tenés los tuyos. Quedan guardados con esta versión.
      </p>

      <label className="field sm:col-span-6">
        Nota (opcional)
        <input name="notes" maxLength={2000} placeholder="Para el croquis; sin cocheras" className="input" />
      </label>

      <div aria-live="polite" className="rounded-lg bg-sunken p-4 sm:col-span-6">
        {estimate ? (
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
            <span className="font-mono text-2xl font-semibold">{formatMoney(estimate.total, work.currency)}</span>
            <span className="font-mono text-sm text-muted">{formatCostPerM2(estimate.costPerM2, work.currency)}</span>
            <span className="text-sm text-muted">sobre {formatArea(estimate.weightedM2)} ponderados</span>
          </div>
        ) : (
          <p className="text-sm text-muted">Escribí el costo de referencia para ver la estimación.</p>
        )}
      </div>

      <div className="flex flex-col gap-1 sm:col-span-6">
        <FieldError errors={state.errors?.reference_cost_m2} />
        <FieldError errors={state.errors?.reference_date} />
        <FieldError errors={state.errors?.reference_source} />
        <FieldError errors={state.errors?.semicovered_factor} />
        <FieldError errors={state.errors?.typology_coef} />
        <FieldError errors={state.errors?.quality_coef} />
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-6">
        <SubmitButton pending={pending} pendingLabel="Guardando…">Guardar estimación</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function OrganizationKindForm({ kind }: { kind: OrgKind }) {
  const { state, pending, formProps } = useActionForm(setOrganizationKind, { resetOnSuccess: false });
  return (
    <form {...formProps} className="flex flex-wrap items-end gap-3">
      <label className="field">
        Tipo de organización
        <select name="kind" defaultValue={kind} className="input">
          {ORG_KINDS.map((k) => (
            <option key={k} value={k}>
              {ORG_KIND_LABEL[k]}
            </option>
          ))}
        </select>
      </label>
      <SubmitButton pending={pending} variant="secondary" pendingLabel="Guardando…">Guardar</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
