import { createClient } from "@/lib/supabase/server";
import { changeOrderCode } from "@/lib/validation";
import { formatMoney } from "@/lib/format";
import { loadComments } from "./comments";
import { ItemLine, SHIPMENT_SELECT, type ShipmentRow } from "./shipments-section";
import { PIECE_SELECT, PieceRow, type PieceRowData } from "./pieces-section";

const dateFmt = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Argentina/Cordoba",
});

// Lo que ve un invitado (cliente, renderista, contratista): lo que le enviaron y lo que tiene
// a cargo. Sin pestañas: el resto del proyecto es del estudio.
export function GuestView({ projectId, orgName }: { projectId: string; orgName: string | null }) {
  return (
    <div className="flex flex-col gap-6">
      <section className="card">
        <h2 className="font-bold">Tu acceso</h2>
        <p className="mt-2 text-sm text-muted">
          {orgName ?? "El estudio"} te sumó a este proyecto. Acá vas a ver los adicionales que te envíen para
          aprobar y los planos vigentes a medida que el estudio los cargue.
        </p>
      </section>
      <GuestShipments projectId={projectId} />
      <GuestChangeOrders projectId={projectId} />
      <GuestPieces projectId={projectId} />
    </div>
  );
}

// El invitado solo ve las órdenes que le enviaron a su correo (lo filtra la base).
const GUEST_STATUS: Record<string, string> = {
  sent: "Esperando tu respuesta: revisá el correo con el link para aprobarla",
  approved: "La aprobaste",
  billable: "La aprobaste",
  rejected: "La rechazaste",
  void: "Anulada por el estudio",
  draft: "El estudio la está revisando; te va a llegar la versión nueva",
};

async function GuestChangeOrders({ projectId }: { projectId: string }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("change_orders")
    .select("id, number, title, amount, currency, status")
    .eq("project_id", projectId)
    .order("number", { ascending: false });
  const orders = (data ?? []) as { id: string; number: number; title: string; amount: string; currency: string; status: string }[];
  if (orders.length === 0) return null;

  return (
    <section className="card flex flex-col gap-4">
      <h2 className="font-bold">Adicionales que te enviaron</h2>
      <ul className="flex flex-col divide-y divide-line">
        {orders.map((o) => (
          <li key={o.id} className="flex flex-col gap-1 py-3 first:pt-0">
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-sm text-muted">{changeOrderCode(o.number)}</span>
              <span className="min-w-0 flex-1 font-medium">{o.title}</span>
              <span className="font-mono whitespace-nowrap">{formatMoney(o.amount, o.currency)}</span>
            </div>
            <p className={`text-xs ${o.status === "sent" ? "text-warn" : "text-muted"}`}>{GUEST_STATUS[o.status] ?? o.status}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

// Lo que el estudio le compartió al invitado, avisando si ya no es lo vigente.
async function GuestShipments({ projectId }: { projectId: string }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("shipments")
    .select(SHIPMENT_SELECT)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  const shipments = (data ?? []) as unknown as ShipmentRow[];
  if (shipments.length === 0) return null;
  const comments = await loadComments(projectId, false);
  return (
    <section className="card flex flex-col gap-4">
      <h2 className="font-bold">Archivos que te compartieron</h2>
      {shipments.map((s) => (
        <div key={s.id} className="flex flex-col gap-1">
          <p className="text-xs text-muted">
            {dateFmt.format(new Date(s.created_at))}
            {s.note && ` · «${s.note}»`}
          </p>
          <ul className="flex flex-col divide-y divide-line text-sm">
            {s.shipment_items.map((i) => (
              <ItemLine
                key={i.id}
                item={i}
                projectId={projectId}
                comments={comments.get((i.revision_id ?? i.dependency_id)!) ?? []}
              />
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

// El renderista (u otro invitado) ve las piezas a su cargo y sube ahí su entrega.
async function GuestPieces({ projectId }: { projectId: string }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("dependencies")
    .select(PIECE_SELECT)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  const pieces = (data ?? []) as unknown as PieceRowData[];
  if (pieces.length === 0) return null;
  const comments = await loadComments(projectId, false);
  return (
    <section id="piezas" className="card flex scroll-mt-6 flex-col gap-4">
      <h2 className="font-bold">Piezas a tu cargo</h2>
      <ul className="flex flex-col divide-y divide-line">
        {pieces.map((p) => (
          <PieceRow key={p.id} piece={p} canReview={false} currentCode={null} comments={comments.get(p.id) ?? []} />
        ))}
      </ul>
    </section>
  );
}
