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

function layout(title: string, body: string, cta: { label: string; url: string }) {
  return `<!doctype html><html lang="es"><body style="margin:0;background:#f6f5f2;font-family:Arial,sans-serif;color:#1c1b19">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:520px;background:#fff;border:1px solid #e4e1da;border-radius:8px">
<tr><td style="padding:28px">
<h1 style="font-size:18px;margin:0 0 12px">${title}</h1>
${body}
<p style="margin:24px 0"><a href="${escapeHtml(cta.url)}" style="background:#1f4e46;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;display:inline-block">${cta.label}</a></p>
<p style="font-size:12px;color:#6b6860;margin:0">Ingresás con este mismo correo; te mandamos un enlace, sin contraseñas.</p>
</td></tr></table></td></tr></table></body></html>`;
}

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
    default:
      throw new Error(`Tipo de correo desconocido: ${msg.kind}`);
  }
}
