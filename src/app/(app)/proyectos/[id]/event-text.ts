import { changeOrderCode } from "@/lib/validation";

// Texto legible de cada evento del registro, para la actividad y el historial del proyecto.
export type EventRow = {
  id: number;
  type: string;
  actor_email: string | null;
  data: Record<string, unknown>;
  created_at: string;
};

const EVENT_LABEL: Record<string, string> = {
  "project.created": "creó el proyecto",
  "project.updated": "modificó el proyecto",
  "guest.invited": "invitó a",
  "guest.accepted": "Un invitado aceptó el acceso",
  "guest.removed": "quitó a",
};

export function eventText(e: EventRow) {
  if (e.type === "stage.hours_80" || e.type === "stage.hours_100") {
    const pct = e.type.endsWith("80") ? "80%" : "100%";
    return `«${String(e.data?.stage_name ?? "Una etapa")}» llegó al ${pct} de las horas previstas`;
  }
  if (e.type.startsWith("change_order.")) {
    const code = changeOrderCode(Number(e.data?.number ?? 0));
    const title = String(e.data?.title ?? "");
    if (e.type === "change_order.approved" || e.type === "change_order.rejected") {
      const verb = e.type === "change_order.approved" ? "aprobó" : "rechazó";
      return `${String(e.data?.signer_name ?? "El cliente")} (${e.actor_email ?? "sin correo"}) ${verb} ${code} «${title}»`;
    }
    if (e.type === "change_order.sent") {
      return `${e.actor_email ?? "Alguien"} envió ${code} «${title}» a ${String(e.data?.recipient_email ?? "el cliente")}`;
    }
    const verb = { "change_order.created": "creó", "change_order.updated": "editó", "change_order.voided": "anuló" }[e.type] ?? e.type;
    return `${e.actor_email ?? "Alguien"} ${verb} ${code} «${title}»`;
  }
  if (e.type === "document.created") {
    return `${e.actor_email ?? "Alguien"} creó el documento ${String(e.data?.code ?? "")} «${String(e.data?.title ?? "")}»`;
  }
  if (e.type === "revision.uploaded") {
    return `${e.actor_email ?? "Alguien"} subió la revisión ${String(e.data?.code ?? "")} (${String(e.data?.file_name ?? "")})`;
  }
  if (e.type === "revision.published") {
    const doc = String(e.data?.document_code ?? "");
    const replaced = e.data?.superseded_code ? `, que reemplaza a ${String(e.data.superseded_code)}` : "";
    const pieces = Number(e.data?.dependencies_to_review ?? 0);
    const toReview = pieces > 0 ? ` (${pieces === 1 ? "1 pieza quedó" : `${pieces} piezas quedaron`} a revisar)` : "";
    return `${e.actor_email ?? "Alguien"} publicó ${doc} ${String(e.data?.code ?? "")}${replaced}${toReview}`;
  }
  if (e.type === "comment.created") {
    const page = e.data?.page ? ` (pág. ${String(e.data.page)})` : "";
    return `${e.actor_email ?? "Alguien"} comentó ${String(e.data?.file ?? "un archivo")}${page}: «${String(e.data?.body ?? "")}»`;
  }
  if (e.type === "comment.resolved") {
    return `${e.actor_email ?? "Alguien"} resolvió el comentario «${String(e.data?.body ?? "")}»`;
  }
  if (e.type.startsWith("deadline.")) {
    const what = { "deadline.created": "agregó el vencimiento", "deadline.done": "marcó como hecho", "deadline.reopened": "reabrió" }[e.type];
    if (e.type === "deadline.alert") return `Aviso: «${String(e.data?.title ?? "")}» vence en ${String(e.data?.days_left ?? "")} días`;
    return `${e.actor_email ?? "Alguien"} ${what ?? e.type} «${String(e.data?.title ?? "")}»`;
  }
  if (e.type === "shipment.sent") {
    const items = Array.isArray(e.data?.items) ? e.data.items.length : 0;
    return `${e.actor_email ?? "Alguien"} le envió ${items === 1 ? "1 archivo" : `${items} archivos`} a ${String(e.data?.recipient_email ?? "")}`;
  }
  if (e.type.startsWith("dependency.")) {
    const title = `«${String(e.data?.title ?? "")}»`;
    switch (e.type) {
      case "dependency.created":
        return `${e.actor_email ?? "Alguien"} creó la pieza ${title} sobre ${String(e.data?.document_code ?? "")} ${String(e.data?.revision_code ?? "")}`;
      case "dependency.uploaded":
        return `${e.actor_email ?? "Alguien"} subió el archivo de ${title}`;
      case "dependency.to_review":
        return `${title} quedó a revisar: ${String(e.data?.document_code ?? "")} ${String(e.data?.from_revision_code ?? "")} se reemplazó por la ${String(e.data?.to_revision_code ?? "")}`;
      case "dependency.revalidated":
        return `${e.actor_email ?? "Alguien"} revalidó ${title} con la ${String(e.data?.to_revision_code ?? "")}`;
      case "dependency.round_closed": {
        const over = e.data?.over_contract ? " (se pasaron las rondas contratadas)" : "";
        return `${e.actor_email ?? "Alguien"} cerró la ronda ${String(e.data?.round ?? "")} de ${title} con ${String(e.data?.comments ?? 0)} comentarios${over}`;
      }
      case "dependency.obsolete":
        return `${e.actor_email ?? "Alguien"} marcó ${title} como obsoleta`;
    }
  }
  const who = e.type === "guest.accepted" ? "" : `${e.actor_email ?? "Alguien"} `;
  const email = typeof e.data?.email === "string" ? ` ${e.data.email}` : "";
  return `${who}${EVENT_LABEL[e.type] ?? e.type}${email}`;
}

