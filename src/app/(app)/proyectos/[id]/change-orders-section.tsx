import { createClient } from "@/lib/supabase/server";
import { Disclosure } from "@/components/disclosure";
import { formatHours, formatMoney } from "@/lib/format";
import { CHANGE_ORDER_STATUS_LABEL, changeOrderCode, type ChangeOrderStatus } from "@/lib/validation";
import { ChangeOrderForm, SendChangeOrderForm, VoidChangeOrderForm, type StageChoice } from "../../co-forms";

type OrderRow = {
  id: string;
  number: number;
  stage_id: string;
  title: string;
  description: string | null;
  hours: string | null;
  amount: string;
  currency: string;
  affected_documents: string[];
  status: ChangeOrderStatus;
  void_reason: string | null;
  created_at: string;
  fee_stages: { name: string } | null;
};

type LinkRow = {
  change_order_id: string;
  recipient_email: string;
  created_at: string;
  expires_at: string;
};

type ApprovalRow = {
  change_order_id: string;
  decision: "approved" | "rejected";
  signer_name: string;
  signer_email: string;
  comment: string | null;
  created_at: string;
};

const STATUS_STYLE: Record<ChangeOrderStatus, string> = {
  draft: "border-line text-muted",
  sent: "border-warn text-warn",
  approved: "border-accent text-accent",
  rejected: "border-danger text-danger",
  billable: "border-accent text-accent",
  void: "border-line text-muted line-through",
};

const dateFmt = new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeZone: "America/Argentina/Cordoba" });

// Server Component: se renderiza una vez por pedido (después de leer cookies), así que
// comparar con la hora actual es estable dentro de ese render.
function isPast(iso: string) {
  return new Date(iso).getTime() <= Date.now();
}

// El último elemento de cada orden (las listas vienen ordenadas por fecha ascendente).
function lastByOrder<T extends { change_order_id: string }>(rows: T[]) {
  const map = new Map<string, T>();
  for (const r of rows) map.set(r.change_order_id, r);
  return map;
}

export async function ChangeOrdersSection({
  projectId,
  isOwner,
  defaultStageId,
}: {
  projectId: string;
  isOwner: boolean;
  defaultStageId?: string;
}) {
  const supabase = await createClient();
  const [{ data: orderData }, { data: stageData }, { data: linkData }, { data: approvalData }, { data: guestData }] =
    await Promise.all([
      supabase
        .from("change_orders")
        .select("id, number, stage_id, title, description, hours, amount, currency, affected_documents, status, void_reason, created_at, fee_stages(name)")
        .eq("project_id", projectId)
        .order("number", { ascending: false }),
      supabase
        .from("fee_stages")
        .select("id, name, currency, hourly_rate")
        .eq("project_id", projectId)
        .order("position")
        .order("created_at"),
      supabase
        .from("approval_links")
        .select("change_order_id, recipient_email, created_at, expires_at, change_orders!inner(project_id)")
        .eq("change_orders.project_id", projectId)
        .order("created_at"),
      supabase
        .from("approvals")
        .select("change_order_id, decision, signer_name, signer_email, comment, created_at, change_orders!inner(project_id)")
        .eq("change_orders.project_id", projectId)
        .order("created_at"),
      supabase.from("project_guests").select("email, kind").eq("project_id", projectId).order("created_at"),
    ]);
  const orders = (orderData ?? []) as unknown as OrderRow[];
  const stages = (stageData ?? []) as StageChoice[];
  const lastLink = lastByOrder((linkData ?? []) as unknown as LinkRow[]);
  const lastApproval = lastByOrder((approvalData ?? []) as unknown as ApprovalRow[]);
  const guests = (guestData ?? []) as { email: string; kind: string }[];
  // Primero los clientes: son los que aprueban.
  const guestEmails = [...guests.filter((g) => g.kind === "client"), ...guests.filter((g) => g.kind !== "client")].map(
    (g) => g.email,
  );
  const validDefault = stages.some((s) => s.id === defaultStageId) ? defaultStageId : undefined;

  return (
    <section id="ordenes" className="card flex scroll-mt-6 flex-col gap-6">
      <div>
        <h2 className="font-medium">Órdenes de cambio</h2>
        <p className="mt-1 text-sm text-muted">
          Lo que el cliente pidió fuera de lo contratado, con horas y monto. Se la mandás por link y la aprueba sin
          crear cuenta; aprobada, suma a su etapa.
        </p>
      </div>

      {stages.length === 0 ? (
        <p className="text-sm text-muted">Para crear órdenes, primero cargá las etapas de honorarios.</p>
      ) : (
        // La key vuelve a abrir el formulario cuando se llega desde "Crear orden de cambio" de otra etapa.
        <Disclosure
          key={validDefault ?? "nueva"}
          defaultOpen={Boolean(validDefault) || orders.length === 0}
          className="rounded-md border border-dashed border-line"
          summary="Nueva orden de cambio"
          summaryClassName="cursor-pointer px-4 py-3 text-sm font-medium"
        >
          <div className="border-t border-line p-4">
            <ChangeOrderForm projectId={projectId} stages={stages} defaultStageId={validDefault} />
          </div>
        </Disclosure>
      )}

      {orders.length > 0 && (
        <ul className="flex flex-col divide-y divide-line">
          {orders.map((o) => {
            const code = changeOrderCode(o.number);
            const editable = o.status === "draft" || o.status === "sent";
            const link = lastLink.get(o.id);
            const approval = lastApproval.get(o.id);
            const expired = o.status === "sent" && link !== undefined && isPast(link.expires_at);
            const summary = editable
              ? `${o.status === "sent" ? "Reenviar" : "Enviar"} o editar ${code}`
              : `Anular ${code}`;
            return (
              <li key={o.id} className="flex flex-col gap-2 py-4 first:pt-0">
                {/* En el teléfono el título va en su propia línea, debajo de número, estado y monto. */}
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="order-1 font-mono text-sm text-muted">{code}</span>
                  <span className="order-4 w-full min-w-0 font-medium sm:order-2 sm:w-auto sm:flex-1">{o.title}</span>
                  <span className={`order-2 rounded-full border px-2 py-0.5 text-xs sm:order-4 ${STATUS_STYLE[o.status]}`}>
                    {CHANGE_ORDER_STATUS_LABEL[o.status]}
                  </span>
                  <span className="order-3 ml-auto font-mono whitespace-nowrap sm:ml-0">{formatMoney(o.amount, o.currency)}</span>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
                  <span>{o.fee_stages?.name}</span>
                  {o.hours !== null && <span>{formatHours(o.hours)}</span>}
                  {o.affected_documents.length > 0 && <span>Afecta {o.affected_documents.join(", ")}</span>}
                  <span>{dateFmt.format(new Date(o.created_at))}</span>
                </div>
                {o.description && <p className="text-sm whitespace-pre-line text-muted">{o.description}</p>}
                {o.status === "sent" && link && (
                  <p className={`text-xs ${expired ? "text-warn" : "text-muted"}`}>
                    Enviada a {link.recipient_email} el {dateFmt.format(new Date(link.created_at))}
                    {expired
                      ? `. El link venció el ${dateFmt.format(new Date(link.expires_at))}: reenviala.`
                      : ` · el link vence el ${dateFmt.format(new Date(link.expires_at))}`}
                  </p>
                )}
                {(o.status === "approved" || o.status === "billable" || o.status === "rejected") && approval && (
                  <p className="text-xs text-muted">
                    {approval.decision === "approved" ? "Aprobada" : "Rechazada"} por {approval.signer_name} (
                    {approval.signer_email}) el {dateFmt.format(new Date(approval.created_at))}
                    {approval.comment && <>: «{approval.comment}»</>}
                  </p>
                )}
                {o.status === "void" && o.void_reason && <p className="text-xs text-muted">Motivo: {o.void_reason}</p>}
                {(editable || (isOwner && o.status !== "void")) && (
                  <details className="rounded-md border border-line">
                    <summary className="cursor-pointer px-4 py-2 text-sm">{summary}</summary>
                    <div className="flex flex-col gap-5 border-t border-line p-4">
                      {editable && (
                        <SendChangeOrderForm
                          projectId={projectId}
                          orderId={o.id}
                          code={code}
                          defaultEmail={link?.recipient_email ?? guestEmails[0] ?? ""}
                          guestEmails={guestEmails}
                          resend={o.status === "sent"}
                        />
                      )}
                      {editable && (
                        <div className="flex flex-col gap-3 border-t border-line pt-5">
                          <h3 className="text-sm font-medium">Editar</h3>
                          <ChangeOrderForm
                            projectId={projectId}
                            stages={stages}
                            sent={o.status === "sent"}
                            order={{
                              id: o.id,
                              stage_id: o.stage_id,
                              title: o.title,
                              description: o.description,
                              hours: o.hours,
                              amount: o.amount,
                              affected_documents: o.affected_documents,
                            }}
                          />
                        </div>
                      )}
                      {isOwner && (
                        <div className={editable ? "border-t border-line pt-5" : ""}>
                          <VoidChangeOrderForm projectId={projectId} orderId={o.id} />
                        </div>
                      )}
                    </div>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
