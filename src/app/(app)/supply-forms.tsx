"use client";

import { useState } from "react";
import { Field, FormMessage, SubmitButton, useActionForm } from "@/components/form";
import { formatIndexValue, formatMoney, formatPeriod, formatUnitPrice } from "@/lib/format";
import { SUPPLY_KINDS, SUPPLY_KIND_LABEL, SUPPLY_UNITS, type SupplyKind } from "@/lib/supplies";
import { CURRENCIES } from "@/lib/validation";
import { importSupplies, saveLaborSetting, saveSupply, type ImportState } from "./supply-actions";

export type SupplyValues = {
  id: string;
  kind: SupplyKind;
  code: string;
  name: string;
  unit: string;
  currency: string;
  // null = sin precio (por ejemplo, creado al importar un análisis del catálogo).
  price: string | null;
  price_date: string | null;
  supplier_party_id: string | null;
  reference_series_code: string | null;
  active: boolean;
};
// Escalas salariales (series en pesos por hora) que ya tienen valores.
export type LaborSeries = { code: string; name: string; last_value: string; last_period: string };

const plain = (n: string) => String(Number(n)).replace(".", ",");

export function SupplyForm({
  supply,
  suppliers,
  laborSeries,
  chargesPct,
  today,
}: {
  supply?: SupplyValues;
  suppliers: { id: string; name: string }[];
  laborSeries: LaborSeries[];
  chargesPct: number | null;
  today: string;
}) {
  const { state, pending, formProps } = useActionForm(saveSupply.bind(null, supply?.id ?? null), {
    resetOnSuccess: !supply,
  });
  const [kind, setKind] = useState<SupplyKind>(supply?.kind ?? "material");
  const [series, setSeries] = useState(supply?.reference_series_code ?? "");
  const linked = kind === "labor" ? laborSeries.find((s) => s.code === series) : undefined;
  const pct = chargesPct ?? 0;

  return (
    <form {...formProps} className="grid gap-3 sm:grid-cols-6">
      <Field label="Tipo" errors={state.errors?.kind} className="sm:col-span-2">
        <select name="kind" value={kind} onChange={(e) => setKind(e.target.value as SupplyKind)} className="input">
          {SUPPLY_KINDS.map((k) => (
            <option key={k} value={k}>
              {SUPPLY_KIND_LABEL[k]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Código" errors={state.errors?.code} className="sm:col-span-2">
        <input name="code" required maxLength={40} defaultValue={supply?.code} placeholder="MAT-001" autoCapitalize="characters" className="input font-mono uppercase" />
      </Field>
      <Field label="Unidad" errors={state.errors?.unit} className="sm:col-span-2">
        <input name="unit" required maxLength={20} list="supply-units" defaultValue={supply?.unit} placeholder="kg" className="input" />
      </Field>
      <datalist id="supply-units">
        {SUPPLY_UNITS.map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>
      <Field label="Nombre" errors={state.errors?.name} className="sm:col-span-6">
        <input name="name" required minLength={2} maxLength={200} defaultValue={supply?.name} placeholder="Cemento Portland x 50 kg" className="input" />
      </Field>

      {kind === "labor" && laborSeries.length > 0 && (
        <Field label="De dónde sale el precio" errors={state.errors?.reference_series_code} className="sm:col-span-6">
          <select name="reference_series_code" value={series} onChange={(e) => setSeries(e.target.value)} className="input">
            <option value="">Lo cargo a mano</option>
            {laborSeries.map((s) => (
              <option key={s.code} value={s.code}>
                Escala {s.name}
              </option>
            ))}
          </select>
        </Field>
      )}

      {linked ? (
        <p className="rounded-lg bg-sunken p-3 text-sm sm:col-span-6">
          <span className="font-mono font-medium">
            {formatMoney(Math.round(Number(linked.last_value) * (100 + pct)) / 100, "ARS")}/h
          </span>{" "}
          <span className="text-muted">
            = valor hora de {formatPeriod(linked.last_period)} ({formatIndexValue(linked.last_value)}) × (1 +{" "}
            {formatIndexValue(pct)} % de cargas). Se actualiza solo con cada paritaria.
            {chargesPct === null && " Todavía no cargaste el coeficiente de cargas: se toma 0 %."}
          </span>
        </p>
      ) : (
        <>
          <Field label="Precio" errors={state.errors?.price} className="sm:col-span-2">
            <input name="price" inputMode="decimal" required defaultValue={supply?.price ? plain(supply.price) : ""} placeholder="9.500" className="input" />
          </Field>
          <Field label="Moneda" errors={state.errors?.currency} className="sm:col-span-2">
            <select name="currency" defaultValue={supply?.currency ?? "ARS"} className="input">
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Fecha del precio" errors={state.errors?.price_date} className="sm:col-span-2">
            <input name="price_date" type="date" required defaultValue={supply?.price_date ?? today} max={today} className="input" />
          </Field>
        </>
      )}

      <Field label="Proveedor (opcional)" errors={state.errors?.supplier_party_id} className="sm:col-span-6">
        <select name="supplier_party_id" defaultValue={supply?.supplier_party_id ?? ""} className="input">
          <option value="">{suppliers.length === 0 ? "Todavía no cargaste proveedores en Terceros" : "Sin proveedor"}</option>
          {suppliers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>

      {supply && (
        <label className="flex items-center gap-2 text-sm sm:col-span-6">
          <input type="checkbox" name="active" defaultChecked={supply.active} />
          Activo (los inactivos no se ofrecen al armar análisis de precios)
        </label>
      )}

      <div className="flex flex-wrap items-center gap-3 sm:col-span-6">
        <SubmitButton pending={pending} pendingLabel="Guardando…">
          {supply ? "Guardar cambios" : "Cargar insumo"}
        </SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function LaborSettingForm({ chargesPct, today }: { chargesPct: number | null; today: string }) {
  const { state, pending, formProps } = useActionForm(saveLaborSetting, { resetOnSuccess: false });
  return (
    <form {...formProps} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-start">
      <Field label="Cargas sociales y Fondo de Cese (%)" errors={state.errors?.charges_pct}>
        <input name="charges_pct" inputMode="decimal" required defaultValue={chargesPct === null ? "" : String(chargesPct).replace(".", ",")} placeholder="62,5" className="input" />
      </Field>
      <Field label="Vale desde" errors={state.errors?.valid_from}>
        <input name="valid_from" type="date" required defaultValue={today} max={today} className="input" />
      </Field>
      <div className="sm:pt-6">
        <SubmitButton pending={pending} variant="secondary" pendingLabel="Guardando…">
          Guardar
        </SubmitButton>
      </div>
      <div className="sm:col-span-3">
        <FormMessage state={state} />
      </div>
    </form>
  );
}

// Importación en dos pasos con el mismo archivo: vista previa y confirmación.
export function ImportSuppliesForm() {
  const { state, pending, formProps } = useActionForm<ImportState>(importSupplies, { resetOnSuccess: false });
  // Si se elige otro archivo después de la vista previa, hay que volver a verla antes de importar:
  // se anota para qué respuesta cambió el archivo, y vale hasta que llegue la respuesta siguiente.
  const [changedFor, setChangedFor] = useState<ImportState | null>(null);
  const preview = changedFor === state ? undefined : state.preview;
  const canConfirm = !!preview && preview.valid > 0 && !state.done;

  return (
    <form {...formProps} className="flex flex-col gap-4">
      <Field label="Archivo de Excel (.xlsx)" errors={state.errors?.file}>
        <input
          name="file"
          type="file"
          required
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={() => setChangedFor(state)}
          className="input"
        />
      </Field>

      {preview && (
        <div aria-live="polite" className="flex flex-col gap-3 rounded-lg bg-sunken p-4 text-sm">
          <p className="font-medium">
            {preview.fileName}: {preview.valid} {preview.valid === 1 ? "fila válida" : "filas válidas"}
            {preview.errorCount > 0 && `, ${preview.errorCount} con errores`}
          </p>
          {preview.valid > 0 && (
            <p className="text-muted">
              {preview.counts.inserted} {preview.counts.inserted === 1 ? "insumo nuevo" : "insumos nuevos"} ·{" "}
              {preview.counts.updated} {preview.counts.updated === 1 ? "cambia de precio" : "cambian de precio"} ·{" "}
              {preview.counts.unchanged} sin cambios
            </p>
          )}
          {preview.sample.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-muted">
                    <th className="py-1 pr-3 font-medium">Fila</th>
                    <th className="py-1 pr-3 font-medium">Código</th>
                    <th className="py-1 pr-3 font-medium">Nombre</th>
                    <th className="py-1 pr-3 font-medium">Unidad</th>
                    <th className="py-1 text-right font-medium">Precio</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.sample.map((r) => (
                    <tr key={r.line} className="border-b border-line last:border-0">
                      <td className="py-1 pr-3 font-mono text-muted">{r.line}</td>
                      <td className="py-1 pr-3 font-mono">{r.code}</td>
                      <td className="py-1 pr-3">{r.name}</td>
                      <td className="py-1 pr-3">{r.unit}</td>
                      <td className="py-1 text-right font-mono whitespace-nowrap">{formatUnitPrice(r.price, r.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.valid > preview.sample.length && (
                <p className="mt-2 text-xs text-muted">Y {preview.valid - preview.sample.length} filas más.</p>
              )}
            </div>
          )}
          {preview.errors.length > 0 && (
            <div>
              <p className="font-medium text-danger">Filas que no se importan</p>
              <ul className="mt-1 flex flex-col gap-1 text-danger">
                {preview.errors.map((e) => (
                  <li key={`${e.line}-${e.message}`}>
                    {e.line > 0 && <span className="font-mono">Fila {e.line}: </span>}
                    {e.message}
                  </li>
                ))}
                {preview.errorCount > preview.errors.length && (
                  <li>Y {preview.errorCount - preview.errors.length} filas más con errores.</li>
                )}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {canConfirm ? (
          <>
            <button type="submit" name="confirm" value="1" disabled={pending} className="btn btn-primary">
              {pending ? "Importando…" : `Importar ${preview.valid} ${preview.valid === 1 ? "fila" : "filas"}`}
            </button>
            <button type="submit" disabled={pending} className="btn btn-secondary">
              Ver de nuevo
            </button>
          </>
        ) : (
          <SubmitButton pending={pending} pendingLabel="Leyendo el archivo…">
            Ver vista previa
          </SubmitButton>
        )}
        <FormMessage state={state} />
      </div>
    </form>
  );
}
