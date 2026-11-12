"use client";

import { useMemo, useState, type FormEvent } from "react";
import { FieldError, FormMessage, SubmitButton, useActionForm } from "@/components/form";
import { formatIndexValue, formatPeriod } from "@/lib/format";
import { parseSeriesPaste } from "@/lib/series";
import { EXCHANGE_SOURCES, EXCHANGE_SOURCE_LABEL } from "@/lib/validation";
import { adoptReferenceSeries, deleteExchangeRate, loadReferenceValues, saveExchangeRate } from "./series-actions";

type SeriesOption = { code: string; name: string; unit: string };

// ---------- Plataforma: pegar valores desde una planilla ----------

export function SeriesPasteForm({ series }: { series: SeriesOption[] }) {
  // No se vacía al guardar: si algo salió mal, se corrige la fila y se vuelve a enviar.
  const { state, pending, formProps } = useActionForm(loadReferenceValues, { resetOnSuccess: false });
  const [text, setText] = useState("");
  const { rows, errors } = useMemo(() => parseSeriesPaste(text), [text]);

  return (
    <form {...formProps} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="field">
          Serie
          <select name="series_code" required defaultValue="" className="input">
            <option value="" disabled>
              Elegí una
            </option>
            {series.map((s) => (
              <option key={s.code} value={s.code}>
                {s.name} ({s.unit})
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Nota (opcional)
          <input name="note" maxLength={500} placeholder="Informe de octubre, rectifica agosto" className="input" />
        </label>
      </div>
      <FieldError errors={state.errors?.series_code} />

      <label className="field">
        Meses y valores
        <textarea
          name="text"
          required
          rows={8}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"Pegá dos columnas desde la planilla, una fila por mes:\n2026-08\t1.234,56\n2026-09\t1.250,10\tprovisorio"}
          className="input font-mono text-sm"
        />
      </label>
      <FieldError errors={state.errors?.text} />

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="provisional" />
        Marcar todos como provisorios
      </label>

      {text.trim() && (
        <div aria-live="polite" className="flex flex-col gap-2 rounded-lg bg-sunken p-4 text-sm">
          <p>
            {rows.length} {rows.length === 1 ? "mes listo" : "meses listos"} para cargar
            {rows.length > 0 && `: de ${formatPeriod(rows[0].period)} a ${formatPeriod(rows.at(-1)!.period)}`}
            {rows.length > 0 && <span className="text-muted"> · último valor {formatIndexValue(rows.at(-1)!.value)}</span>}
          </p>
          {errors.length > 0 && (
            <ul className="flex flex-col gap-1 text-danger">
              {errors.slice(0, 8).map((e) => (
                <li key={`${e.line}-${e.message}`}>
                  {e.line > 0 && <span className="font-mono">Fila {e.line}: </span>}
                  {e.message}
                  {e.text && <span className="text-muted"> («{e.text}»)</span>}
                </li>
              ))}
              {errors.length > 8 && <li>Y {errors.length - 8} más.</li>}
            </ul>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pending={pending} pendingLabel="Cargando…">
          Cargar valores
        </SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

// ---------- Estudio: adoptar una serie ----------

export function AdoptSeriesForm({ series, manualNames }: { series: SeriesOption[]; manualNames: string[] }) {
  const { state, pending, formProps } = useActionForm(adoptReferenceSeries);
  // null = lo que corresponde por defecto. Después de adoptar, la serie sale de la lista:
  // se vuelve a la primera que queda, con su nombre.
  const [picked, setPicked] = useState<{ code: string; name: string } | null>(null);
  const [lastState, setLastState] = useState(state);
  if (state !== lastState) {
    setLastState(state);
    if (state.ok) setPicked(null);
  }
  const current = picked && series.some((s) => s.code === picked.code) ? picked : null;
  const code = current?.code ?? series[0]?.code ?? "";
  const name = current?.name ?? series[0]?.name ?? "";
  const collides = manualNames.includes(name.trim());

  return (
    <form {...formProps} className="grid gap-3 sm:grid-cols-[2fr_2fr_auto] sm:items-end">
      <label className="field">
        Serie
        <select
          name="series_code"
          value={code}
          onChange={(e) =>
            setPicked({ code: e.target.value, name: series.find((s) => s.code === e.target.value)?.name ?? "" })
          }
          className="input"
        >
          {series.map((s) => (
            <option key={s.code} value={s.code}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Nombre en el estudio
        <input
          name="local_name"
          required
          minLength={2}
          maxLength={60}
          value={name}
          onChange={(e) => setPicked({ code, name: e.target.value })}
          className="input"
        />
      </label>
      <SubmitButton pending={pending} pendingLabel="Adoptando…">
        Adoptar
      </SubmitButton>
      {collides && (
        <label className="flex items-start gap-2 text-sm sm:col-span-3">
          <input type="checkbox" name="replace" className="mt-1" />
          <span>
            Ya cargaste «{name.trim()}» a mano. Reemplazar esos valores por los de la serie (las etapas que lo usan
            pasan a ajustarse con la serie).
          </span>
        </label>
      )}
      <div className="flex flex-col gap-1 sm:col-span-3">
        <FieldError errors={state.errors?.local_name} />
        <FormMessage state={state} />
      </div>
    </form>
  );
}

// ---------- Estudio: tipo de cambio ----------

export function ExchangeRateForm({ today }: { today: string }) {
  const { state, pending, formProps } = useActionForm(saveExchangeRate);
  return (
    <form {...formProps} className="grid gap-3 sm:grid-cols-[1fr_1.5fr_1fr_auto] sm:items-end">
      <label className="field">
        Fecha
        <input name="rate_date" type="date" required defaultValue={today} max={today} className="input" />
      </label>
      <label className="field">
        Fuente
        <select name="source" defaultValue="official" className="input">
          {EXCHANGE_SOURCES.map((s) => (
            <option key={s} value={s}>
              {EXCHANGE_SOURCE_LABEL[s]}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Pesos por dólar
        <input name="rate" inputMode="decimal" required placeholder="1.050" className="input" />
      </label>
      <SubmitButton pending={pending} pendingLabel="Guardando…">
        Guardar
      </SubmitButton>
      <div className="flex flex-col gap-1 sm:col-span-4">
        <FieldError errors={state.errors?.rate_date} />
        <FieldError errors={state.errors?.rate} />
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function DeleteExchangeRateForm({ id, label }: { id: string; label: string }) {
  function confirmDelete(event: FormEvent<HTMLFormElement>) {
    if (!window.confirm(`¿Borrar la cotización ${label}?`)) event.preventDefault();
  }
  return (
    <form action={deleteExchangeRate.bind(null, id)} onSubmit={confirmDelete}>
      <SubmitButton variant="ghost" pendingLabel="…">
        Borrar
      </SubmitButton>
    </form>
  );
}
