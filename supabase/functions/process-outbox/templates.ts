// Plantillas de correo. Módulo puro (sin APIs de Deno) para poder probarlo con Vitest.

export type OutboxMessage = {
  id: number;
  kind: string;
  to_email: string;
  payload: Record<string, unknown>;
};

export type Email = { subject: string; html: string; text: string };

const KIND_LABEL: Record<string, string> = {
  client: "cliente",
  renderer: "renderista",
  contractor: "contratista",
};

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const PIECE_KIND: Record<string, string> = {
  render: "render",
  sales_plan: "plano de venta",
  brochure: "brochure",
  other: "pieza",
};

const LOGIN_NOTE = "Ingresás con este mismo correo; te mandamos un enlace, sin contraseñas.";

function layout(title: string, body: string, cta: { label: string; url: string }, note = LOGIN_NOTE) {
  return `<!doctype html><html lang="es"><body style="margin:0;background:#f6f5f2;font-family:Arial,sans-serif;color:#1c1b19">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:520px;background:#fff;border:1px solid #e4e1da;border-radius:8px">
<tr><td style="padding:28px">
<h1 style="font-size:18px;margin:0 0 12px">${title}</h1>
${body}
<p style="margin:24px 0"><a href="${escapeHtml(cta.url)}" style="background:#1f4e46;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;display:inline-block">${cta.label}</a></p>
<p style="font-size:12px;color:#6b6860;margin:0">${note}</p>
</td></tr></table></td></tr></table></body></html>`;
}

// "USD 1.800" o "USD 1.800,55", como en la app.
export function formatMoney(amount: unknown, currency: unknown) {
  const n = Number(amount);
  const cur = currency === "USD" ? "USD" : "ARS";
  const decimals = Math.round(n * 100) % 100 !== 0 ? 2 : 0;
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: cur,
    currencyDisplay: "code",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
    .format(n)
    .replace(/\s/g, " ");
}

function changeOrderCode(n: unknown) {
  return `OC-${String(Number(n) || 0).padStart(3, "0")}`;
}

const dateFmt = new Intl.DateTimeFormat("es-AR", { dateStyle: "long", timeZone: "America/Argentina/Cordoba" });

export function renderEmail(msg: OutboxMessage, appUrl: string): Email {
  const base = appUrl.replace(/\/$/, "");
  const p = msg.payload ?? {};

  switch (msg.kind) {
    case "guest_invitation": {
      const org = String(p.org_name ?? "Un estudio");
      const project = String(p.project_name ?? "un proyecto");
      const kind = KIND_LABEL[String(p.kind)] ?? "invitado";
      const url = `${base}/login?next=${encodeURIComponent(`/proyectos/${String(p.project_id ?? "")}`)}`;
      const subject = `${org} te invitó al proyecto ${project}`;
      return {
        subject,
        html: layout(
          `${escapeHtml(org)} te invitó a ${escapeHtml(project)}`,
          `<p style="margin:0;line-height:1.5">Te sumaron como <strong>${escapeHtml(kind)}</strong>. Vas a poder ver los planos vigentes y aprobar adicionales desde un solo lugar. No tiene costo para vos.</p>`,
          { label: "Ver el proyecto", url },
        ),
        text: `${subject}.\nTe sumaron como ${kind}. Entrá acá: ${url}\nIngresás con este correo; te mandamos un enlace, sin contraseñas.`,
      };
    }
    case "member_invitation": {
      const org = String(p.org_name ?? "un estudio");
      const role = p.role === "owner" ? "dueño" : "miembro";
      const url = `${base}/login?next=${encodeURIComponent("/proyectos")}`;
      const subject = `Te invitaron a sumarte a ${org}`;
      return {
        subject,
        html: layout(
          `Sumate a ${escapeHtml(org)}`,
          `<p style="margin:0;line-height:1.5">Te invitaron como <strong>${role}</strong> del estudio en RP Backoffice.</p>`,
          { label: "Aceptar invitación", url },
        ),
        text: `${subject} como ${role}. Entrá acá: ${url}`,
      };
    }
    case "hours_alert": {
      const project = String(p.project_name ?? "un proyecto");
      const stage = String(p.stage_name ?? "una etapa");
      const threshold = Number(p.threshold) >= 100 ? "100%" : "80%";
      const used = String(p.used ?? "").replace(".", ",");
      const budget = String(p.budget ?? "").replace(".", ",");
      const url = `${base}/proyectos/${encodeURIComponent(String(p.project_id ?? ""))}`;
      const subject = `${project}: «${stage}» llegó al ${threshold} de las horas previstas`;
      const extra =
        threshold === "100%"
          ? "Si el cliente pidió cambios fuera de lo contratado, es buen momento para armar una orden de cambio."
          : "Todavía estás a tiempo de revisar si hay trabajo fuera de lo contratado.";
      return {
        subject,
        html: layout(
          `«${escapeHtml(stage)}» llegó al ${threshold}`,
          `<p style="margin:0 0 8px;line-height:1.5">En <strong>${escapeHtml(project)}</strong> van <strong>${escapeHtml(used)} h</strong> de <strong>${escapeHtml(budget)} h</strong> previstas.</p><p style="margin:0;line-height:1.5">${extra}</p>`,
          { label: "Ver el proyecto", url },
        ),
        text: `${subject}.\nVan ${used} h de ${budget} h previstas. ${extra}\n${url}`,
      };
    }
    case "change_order_sent": {
      const org = String(p.org_name ?? "El estudio");
      const project = String(p.project_name ?? "tu proyecto");
      const code = changeOrderCode(p.number);
      const title = String(p.title ?? "");
      const amount = formatMoney(p.amount, p.currency);
      const expires = p.expires_at ? dateFmt.format(new Date(String(p.expires_at))) : "";
      const url = `${base}/aprobar/${encodeURIComponent(String(p.token ?? ""))}`;
      const subject = `${org} te envió la orden de cambio ${code} para aprobar`;
      const note = "No hace falta crear una cuenta. El link es personal: no lo reenvíes.";
      return {
        subject,
        html: layout(
          `${escapeHtml(title)}`,
          `<p style="margin:0 0 8px;line-height:1.5"><strong>${escapeHtml(org)}</strong> te pide que apruebes un adicional en <strong>${escapeHtml(project)}</strong> (${code}).</p>
<p style="margin:0 0 8px;font-size:22px;font-weight:bold;font-family:monospace">${escapeHtml(amount)}</p>
<p style="margin:0;line-height:1.5;color:#6b6860">Revisá el detalle y aprobalo o rechazalo desde el teléfono${expires ? `. El link vence el ${escapeHtml(expires)}` : ""}.</p>`,
          { label: "Revisar y aprobar", url },
          note,
        ),
        text: `${subject}.\n${title} · ${project}: ${amount}.\nRevisala y aprobala o rechazala acá: ${url}\n${expires ? `El link vence el ${expires}. ` : ""}${note}`,
      };
    }
    case "change_order_decided": {
      const approved = p.decision === "approved";
      const project = String(p.project_name ?? "un proyecto");
      const code = changeOrderCode(p.number);
      const title = String(p.title ?? "");
      const signer = String(p.signer_name ?? "El cliente");
      const amount = formatMoney(p.amount, p.currency);
      const verb = approved ? "aprobó" : "rechazó";
      const url = `${base}/proyectos/${encodeURIComponent(String(p.project_id ?? ""))}#ordenes`;
      const subject = `${project}: ${signer} ${verb} ${code}`;
      const comment = p.comment ? String(p.comment) : "";
      const extra = approved ? `Se suma ${amount} a los honorarios de la etapa.` : "La orden no suma a los honorarios.";
      return {
        subject,
        html: layout(
          `${escapeHtml(signer)} ${verb} ${code}`,
          `<p style="margin:0 0 8px;line-height:1.5">«${escapeHtml(title)}» en <strong>${escapeHtml(project)}</strong>, por <strong>${escapeHtml(amount)}</strong>. ${escapeHtml(extra)}</p>${
            comment ? `<p style="margin:0;line-height:1.5;color:#6b6860">Comentario: «${escapeHtml(comment)}»</p>` : ""
          }`,
          { label: "Ver la orden", url },
        ),
        text: `${subject}.\n«${title}» en ${project}, por ${amount}. ${extra}${comment ? `\nComentario: «${comment}»` : ""}\n${url}`,
      };
    }
    case "dependency_to_review": {
      const project = String(p.project_name ?? "un proyecto");
      const piece = String(p.title ?? "una pieza");
      const kind = PIECE_KIND[String(p.kind)] ?? "pieza";
      const doc = String(p.document_code ?? "");
      const from = String(p.from_revision_code ?? "");
      const to = String(p.to_revision_code ?? "");
      const url = `${base}/proyectos/${encodeURIComponent(String(p.project_id ?? ""))}#piezas`;
      const subject = `${project}: «${piece}» quedó a revisar`;
      const body = `Se publicó ${doc} ${to}, que reemplaza a la ${from} sobre la que se hizo este ${kind}. Revisá si sigue sirviendo o si hay que rehacerlo.`;
      return {
        subject,
        html: layout(
          `«${escapeHtml(piece)}» quedó a revisar`,
          `<p style="margin:0;line-height:1.5">En <strong>${escapeHtml(project)}</strong>: ${escapeHtml(body)}</p>`,
          { label: "Ver la pieza", url },
        ),
        text: `${subject}.\n${body}\n${url}`,
      };
    }
    case "shipment_sent": {
      const org = String(p.org_name ?? "El estudio");
      const project = String(p.project_name ?? "tu proyecto");
      const labels = Array.isArray(p.labels) ? p.labels.map(String) : [];
      const note = p.note ? String(p.note) : "";
      const url = `${base}/login?next=${encodeURIComponent(`/proyectos/${String(p.project_id ?? "")}`)}`;
      const subject = `${org} te compartió ${labels.length === 1 ? "un archivo" : `${labels.length} archivos`} de ${project}`;
      const list = labels.map((l) => `<li>${escapeHtml(l)}</li>`).join("");
      return {
        subject,
        html: layout(
          `Archivos de ${escapeHtml(project)}`,
          `<p style="margin:0 0 8px;line-height:1.5"><strong>${escapeHtml(org)}</strong> te compartió:</p><ul style="margin:0 0 8px;padding-left:20px;line-height:1.6">${list}</ul>${
            note ? `<p style="margin:0;line-height:1.5;color:#6b6860">«${escapeHtml(note)}»</p>` : ""
          }`,
          { label: "Ver los archivos", url },
        ),
        text: `${subject}:\n${labels.map((l) => `- ${l}`).join("\n")}${note ? `\n«${note}»` : ""}\nEntrá acá: ${url}`,
      };
    }
    case "comment_added": {
      const project = String(p.project_name ?? "un proyecto");
      const file = String(p.file ?? "un archivo");
      const author = String(p.author_email ?? "Un invitado");
      const page = p.page ? ` (pág. ${String(p.page)})` : "";
      const body = String(p.body ?? "");
      const url = `${base}/proyectos/${encodeURIComponent(String(p.project_id ?? ""))}`;
      const subject = `${project}: ${author} comentó ${file}`;
      return {
        subject,
        html: layout(
          `${escapeHtml(author)} comentó ${escapeHtml(file)}${escapeHtml(page)}`,
          `<p style="margin:0;line-height:1.5;white-space:pre-line">«${escapeHtml(body)}»</p>`,
          { label: "Ver y responder", url },
        ),
        text: `${subject}${page}:\n«${body}»\n${url}`,
      };
    }
    case "round_closed": {
      const project = String(p.project_name ?? "un proyecto");
      const piece = String(p.title ?? "la pieza");
      const round = Number(p.round ?? 1);
      const n = Number(p.comments ?? 0);
      const contracted = p.rounds_contracted === null || p.rounds_contracted === undefined ? null : Number(p.rounds_contracted);
      const url = `${base}/proyectos/${encodeURIComponent(String(p.project_id ?? ""))}`;
      const subject = `${project}: correcciones de la ronda ${round} de «${piece}»`;
      const count = n === 1 ? "1 comentario" : `${n} comentarios`;
      const extra = contracted !== null ? ` Van ${round} de ${contracted} rondas contratadas.` : "";
      return {
        subject,
        html: layout(
          `Ronda ${round} de «${escapeHtml(piece)}»`,
          `<p style="margin:0;line-height:1.5">El estudio cerró la ronda con <strong>${count}</strong> para corregir en <strong>${escapeHtml(project)}</strong>.${escapeHtml(extra)}</p>`,
          { label: "Ver los comentarios", url },
        ),
        text: `${subject}.\nHay ${count} para corregir.${extra}\n${url}`,
      };
    }
    default:
      throw new Error(`Tipo de correo desconocido: ${msg.kind}`);
  }
}
