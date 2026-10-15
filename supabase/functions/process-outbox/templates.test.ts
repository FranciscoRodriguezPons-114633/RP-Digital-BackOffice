import { describe, expect, it } from "vitest";
import { escapeHtml, renderEmail } from "./templates";

const APP = "https://app.rp.test/";

describe("renderEmail", () => {
  it("invitación a proyecto: asunto, enlace al proyecto y rol", () => {
    const email = renderEmail(
      {
        id: 1,
        kind: "guest_invitation",
        to_email: "cliente@gmail.com",
        payload: { org_name: "Estudio A", project_name: "Edificio Alba", project_id: "p-1", kind: "client" },
      },
      APP,
    );
    expect(email.subject).toBe("Estudio A te invitó al proyecto Edificio Alba");
    expect(email.text).toContain("https://app.rp.test/login?next=%2Fproyectos%2Fp-1");
    expect(email.html).toContain("<strong>cliente</strong>");
  });

  it("escapa HTML en datos cargados por usuarios", () => {
    const email = renderEmail(
      {
        id: 2,
        kind: "guest_invitation",
        to_email: "x@x.com",
        payload: { org_name: "<script>alert(1)</script>", project_name: "P", project_id: "p", kind: "renderer" },
      },
      APP,
    );
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
  });

  it("invitación de miembro con rol dueño", () => {
    const email = renderEmail(
      { id: 3, kind: "member_invitation", to_email: "b@b.com", payload: { org_name: "Estudio A", role: "owner" } },
      APP,
    );
    expect(email.subject).toBe("Te invitaron a sumarte a Estudio A");
    expect(email.html).toContain("<strong>dueño</strong>");
  });

  it("aviso de horas: asunto con etapa y umbral, horas con coma", () => {
    const email = renderEmail(
      {
        id: 5,
        kind: "hours_alert",
        to_email: "ana@a.com",
        payload: { project_name: "Edificio Alba", project_id: "p-1", stage_name: "Anteproyecto", threshold: 80, used: 72.5, budget: 90 },
      },
      APP,
    );
    expect(email.subject).toBe("Edificio Alba: «Anteproyecto» llegó al 80% de las horas previstas");
    expect(email.text).toContain("Van 72,5 h de 90 h previstas");
    expect(email.text).toContain("https://app.rp.test/proyectos/p-1");
  });

  it("falla con un tipo desconocido (el outbox lo reintenta y termina en failed)", () => {
    expect(() => renderEmail({ id: 4, kind: "otro", to_email: "a@a.com", payload: {} }, APP)).toThrow();
  });
});

describe("escapeHtml", () => {
  it("escapa comillas y ampersand", () => {
    expect(escapeHtml(`"Tom & Jerry's"`)).toBe("&quot;Tom &amp; Jerry&#39;s&quot;");
  });
});
