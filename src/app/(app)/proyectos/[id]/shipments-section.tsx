import { createClient } from "@/lib/supabase/server";
import { Disclosure } from "@/components/disclosure";
import { StatusPill, type PillTone } from "@/components/status-pill";
import { PIECE_KIND_LABEL, SHIPMENT_CHANNEL_LABEL, type PieceKind } from "@/lib/validation";
import { ShipmentForm, type ShippableFile } from "../../shipment-forms";
import { CommentThread, type CommentView } from "../../comment-thread";

export type ShipmentItem = {
  id: string;
  label: string;
  file_name: string;
  sha256: string;
  first_opened_at: string | null;
  last_opened_at: string | null;
  open_count: number;
  revision_id: string | null;
  dependency_id: string | null;
  revisions: { status: string } | null;
  dependencies: { status: string } | null;
};

export type ShipmentRow = {
  id: string;
  recipient_email: string;
  channel: keyof typeof SHIPMENT_CHANNEL_LABEL;
  note: string | null;
  created_at: string;
  shipment_items: ShipmentItem[];
};

export const SHIPMENT_SELECT =
  "id, recipient_email, channel, note, created_at, shipment_items(id, label, file_name, sha256, first_opened_at, " +
  "last_opened_at, open_count, revision_id, dependency_id, revisions(status), dependencies(status))";

const dateFmt = new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeZone: "America/Argentina/Cordoba" });
const dateTimeFmt = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Argentina/Cordoba",
});

// ¿Lo que se mandó sigue siendo lo vigente?
export function itemCurrency(item: ShipmentItem): { text: string; tone: PillTone } {
  const status = item.revisions?.status ?? item.dependencies?.status;
  if (status === "superseded") return { text: "Ya no es la vigente", tone: "warn" };
  if (status === "to_review") return { text: "A revisar", tone: "warn" };
  if (status === "obsolete") return { text: "Obsoleta", tone: "danger" };
  if (status === "published" || status === "current" || status === "revalidated") return { text: "Vigente", tone: "accent" };
  return { text: "Borrador compartido", tone: "neutral" };
}

export function ItemLine({
  item,
  projectId,
  comments,
}: {
  item: ShipmentItem;
  projectId?: string;
  comments?: CommentView[];
}) {
  const currency = itemCurrency(item);
  const fileId = item.revision_id ?? item.dependency_id;
  return (
    <li className="flex flex-col gap-0.5 py-1.5">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <a href={`/archivos/${fileId}`} className="min-w-0 flex-1 underline">
          {item.label}
        </a>
        <StatusPill tone={currency.tone} className="self-center">{currency.text}</StatusPill>
      </div>
      <div className="flex flex-wrap gap-x-3 text-xs text-muted">
        <span className="font-mono" title={`SHA-256 ${item.sha256}`}>
          huella {item.sha256.slice(0, 12)}…
        </span>
        <span>
          {item.first_opened_at
            ? `Abierto el ${dateTimeFmt.format(new Date(item.first_opened_at))}${item.open_count > 1 ? ` · ${item.open_count} veces` : ""}`
            : "Sin abrir"}
        </span>
      </div>
      {projectId && comments && (
        <CommentThread
          projectId={projectId}
          target={{ revisionId: item.revision_id, dependencyId: item.dependency_id }}
          comments={comments}
          isPdf={item.file_name.toLowerCase().endsWith(".pdf")}
          imageUrl={/\.(png|jpe?g|webp)$/i.test(item.file_name) ? `/archivos/${fileId}?ver` : undefined}
        />
      )}
    </li>
  );
}

export async function ShipmentsSection({ projectId }: { projectId: string }) {
  const supabase = await createClient();
  const [{ data: shipmentData }, { data: guestData }, { data: revData }, { data: pieceData }] = await Promise.all([
    supabase.from("shipments").select(SHIPMENT_SELECT).eq("project_id", projectId).order("created_at", { ascending: false }),
    supabase.from("project_guests").select("email, kind").eq("project_id", projectId).order("created_at"),
    supabase
      .from("revisions")
      .select("id, code, status, documents(code, title)")
      .eq("project_id", projectId)
      .in("status", ["published", "draft", "shared"])
      .not("uploaded_at", "is", null),
    supabase
      .from("dependencies")
      .select("id, title, kind, status")
      .eq("project_id", projectId)
      .neq("status", "obsolete")
      .not("uploaded_at", "is", null),
  ]);
  const shipments = (shipmentData ?? []) as unknown as ShipmentRow[];
  const guests = (guestData ?? []) as { email: string; kind: string }[];
  const revisions: ShippableFile[] = ((revData ?? []) as unknown as {
    id: string;
    code: string;
    status: string;
    documents: { code: string; title: string } | null;
  }[])
    .map((r) => ({
      id: r.id,
      label: `${r.documents?.code ?? ""} ${r.code} · ${r.documents?.title ?? ""}`,
      hint: r.status === "published" ? "Vigente" : "Borrador: se comparte para revisar",
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "es"));
  const pieces: ShippableFile[] = ((pieceData ?? []) as { id: string; title: string; kind: PieceKind; status: string }[]).map((p) => ({
    id: p.id,
    label: p.title,
    hint: `${PIECE_KIND_LABEL[p.kind]}${p.status === "to_review" ? " · a revisar" : ""}`,
  }));

  // Historial por destinatario: qué recibió cada uno, cuándo y si lo abrió.
  const byRecipient = new Map<string, ShipmentRow[]>();
  for (const s of shipments) byRecipient.set(s.recipient_email, [...(byRecipient.get(s.recipient_email) ?? []), s]);

  return (
    <section id="envios" className="card flex scroll-mt-6 flex-col gap-6">
      <div>
        <h2 className="font-medium">Envíos</h2>
        <p className="mt-1 text-sm text-muted">
          Qué le mandaste a cada cliente, renderista o contratista, cuándo, y si lo abrió. Si una revisión enviada se
          reemplazó, lo vas a ver acá.
        </p>
      </div>

      {guests.length === 0 ? (
        <p className="text-sm text-muted">Para registrar envíos, primero invitá al cliente o al proveedor al proyecto.</p>
      ) : revisions.length + pieces.length === 0 ? (
        <p className="text-sm text-muted">Todavía no hay archivos para enviar: subí una revisión en Planos y documentos.</p>
      ) : (
        <Disclosure
          defaultOpen={false}
          className="rounded-md border border-dashed border-line"
          summary="Enviar archivos a un invitado"
          summaryClassName="cursor-pointer px-4 py-3 text-sm font-medium"
        >
          <div className="border-t border-line p-4">
            <ShipmentForm projectId={projectId} guests={guests} revisions={revisions} pieces={pieces} />
          </div>
        </Disclosure>
      )}

      {byRecipient.size > 0 && (
        <ul className="flex flex-col divide-y divide-line">
          {[...byRecipient.entries()].map(([email, list]) => (
            <li key={email} className="flex flex-col gap-3 py-4 first:pt-0">
              <div className="flex flex-wrap items-baseline gap-x-3">
                <span className="font-medium break-all">{email}</span>
                <span className="text-xs text-muted">
                  {list.length === 1 ? "1 envío" : `${list.length} envíos`} · último el {dateFmt.format(new Date(list[0].created_at))}
                </span>
              </div>
              {list.map((s) => (
                <div key={s.id} className="rounded-md border border-line p-3 text-sm">
                  <div className="text-xs text-muted">
                    {dateTimeFmt.format(new Date(s.created_at))} · {SHIPMENT_CHANNEL_LABEL[s.channel]}
                    {s.note && ` · «${s.note}»`}
                  </div>
                  <ul className="mt-1 flex flex-col divide-y divide-line">
                    {s.shipment_items.map((i) => (
                      <ItemLine key={i.id} item={i} />
                    ))}
                  </ul>
                </div>
              ))}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
