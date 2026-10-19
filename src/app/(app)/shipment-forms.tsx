"use client";

import { FieldError, FormMessage, SubmitButton, useActionForm } from "@/components/form";
import { SHIPMENT_CHANNEL_LABEL, SHIPMENT_CHANNELS } from "@/lib/validation";
import { sendShipment } from "./shipment-actions";

export type ShippableFile = { id: string; label: string; hint: string };

export function ShipmentForm({
  projectId,
  guests,
  revisions,
  pieces,
}: {
  projectId: string;
  guests: { email: string; kind: string }[];
  revisions: ShippableFile[];
  pieces: ShippableFile[];
}) {
  const { state, pending, formProps } = useActionForm(sendShipment.bind(null, projectId));
  return (
    <form {...formProps} className="grid grid-cols-1 gap-4 sm:grid-cols-6">
      <label className="field sm:col-span-3">
        Para
        <select name="recipient_email" required className="input">
          {guests.map((g) => (
            <option key={g.email} value={g.email}>
              {g.email}
            </option>
          ))}
        </select>
      </label>
      <label className="field sm:col-span-3">
        Cómo
        <select name="channel" defaultValue="email" className="input">
          {SHIPMENT_CHANNELS.map((c) => (
            <option key={c} value={c}>
              {SHIPMENT_CHANNEL_LABEL[c]}
            </option>
          ))}
        </select>
      </label>
      <FileChecklist title="Revisiones" name="revision_ids" files={revisions} />
      <FileChecklist title="Piezas" name="dependency_ids" files={pieces} />
      <label className="field sm:col-span-6">
        Nota (opcional)
        <input name="note" maxLength={500} placeholder="Para la reunión del jueves" className="input" />
      </label>
      <div className="flex flex-col gap-1 sm:col-span-6">
        <FieldError errors={state.errors?.recipient_email} />
        <FieldError errors={state.errors?.files} />
        <p className="text-xs text-muted">
          Queda registrado qué archivo exacto se mandó (su huella), a quién y cuándo. El invitado entra con su correo y
          ve solo lo que le compartiste.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-6">
        <SubmitButton pending={pending} pendingLabel="Registrando…">Registrar envío</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

function FileChecklist({ title, name, files }: { title: string; name: string; files: ShippableFile[] }) {
  if (files.length === 0) return null;
  return (
    <fieldset className="flex flex-col gap-2 sm:col-span-3">
      <legend className="mb-1 text-sm font-medium">{title}</legend>
      {files.map((f) => (
        <label key={f.id} className="flex items-start gap-2 text-sm">
          <input type="checkbox" name={name} value={f.id} className="mt-1" />
          <span className="min-w-0">
            {f.label}
            <span className="block text-xs text-muted">{f.hint}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}
