import { describe, expect, it } from "vitest";
import {
  emailSchema,
  guestInviteSchema,
  memberInviteSchema,
  projectSchema,
  safeNext,
} from "./validation";

const UUID = "a007cc6b-0c7e-4a43-9a43-1b1b1b1b1b1b";

describe("emailSchema", () => {
  it("normaliza espacios y mayúsculas", () => {
    expect(emailSchema.parse("  Cliente@Gmail.COM ")).toBe("cliente@gmail.com");
  });
  it("rechaza correos inválidos con mensaje en castellano", () => {
    const r = emailSchema.safeParse("no-es-correo");
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toBe("Ese correo no parece válido");
  });
});

describe("projectSchema", () => {
  it("convierte campos opcionales vacíos en null", () => {
    expect(projectSchema.parse({ name: " Edificio Alba ", code: "", client_name: "  " })).toEqual({
      name: "Edificio Alba",
      code: null,
      client_name: null,
    });
  });
  it("exige al menos 2 caracteres en el nombre", () => {
    expect(projectSchema.safeParse({ name: "A" }).success).toBe(false);
  });
});

describe("guestInviteSchema", () => {
  it("acepta los tres tipos de invitado", () => {
    for (const kind of ["client", "renderer", "contractor"]) {
      expect(guestInviteSchema.safeParse({ project_id: UUID, email: "a@b.com", kind }).success).toBe(true);
    }
  });
  it("rechaza un tipo desconocido y un proyecto que no es uuid", () => {
    expect(guestInviteSchema.safeParse({ project_id: UUID, email: "a@b.com", kind: "jefe" }).success).toBe(false);
    expect(guestInviteSchema.safeParse({ project_id: "1", email: "a@b.com", kind: "client" }).success).toBe(false);
  });
});

describe("memberInviteSchema", () => {
  it("usa 'member' como rol por defecto", () => {
    expect(memberInviteSchema.parse({ org_id: UUID, email: "a@b.com" }).role).toBe("member");
  });
});

describe("safeNext", () => {
  it.each([
    ["/proyectos/1", "/proyectos/1"],
    [null, "/"],
    ["https://evil.com", "/"],
    ["//evil.com", "/"],
    ["/\\evil.com", "/"],
  ])("%s → %s", (input, expected) => {
    expect(safeNext(input)).toBe(expected);
  });
});
