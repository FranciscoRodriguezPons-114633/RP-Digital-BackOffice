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

import { parseDecimal, stageSchema, timeEntrySchema } from "./validation";

describe("parseDecimal", () => {
  it.each([
    ["7,5", 7.5],
    ["7.5", 7.5],
    ["1.500", 1500],
    ["1.234,50", 1234.5],
    ["USD 16.800", 16800],
    ["", null],
  ])("%s → %s", (input, expected) => {
    expect(parseDecimal(input)).toBe(expected);
  });
  it("devuelve NaN si no es un número", () => {
    expect(parseDecimal("doce")).toBeNaN();
  });
});

describe("stageSchema", () => {
  const base = { name: "Anteproyecto", currency: "USD", amount: "", hourly_rate: "", budget_hours: "" };
  it("exige monto si es fija y tarifa si es por hora", () => {
    expect(stageSchema.safeParse({ ...base, kind: "fixed" }).success).toBe(false);
    expect(stageSchema.safeParse({ ...base, kind: "hourly" }).success).toBe(false);
    expect(stageSchema.safeParse({ ...base, kind: "mixed", amount: "100" }).success).toBe(false);
  });
  it("descarta la tarifa en una etapa fija", () => {
    const r = stageSchema.parse({ ...base, kind: "fixed", amount: "7.200", hourly_rate: "45" });
    expect(r).toMatchObject({ amount: 7200, hourly_rate: null, budget_hours: null });
  });
  it("rechaza montos negativos", () => {
    expect(stageSchema.safeParse({ ...base, kind: "fixed", amount: "-1" }).success).toBe(false);
  });
});

describe("timeEntrySchema", () => {
  const base = { stage_id: "a007cc6b-0c7e-4a43-9a43-1b1b1b1b1b1b", work_date: "2026-10-15" };
  it("acepta 7,5 h", () => {
    expect(timeEntrySchema.parse({ ...base, hours: "7,5" }).hours).toBe(7.5);
  });
  it("rechaza 0 h, más de 24 h y fechas inválidas", () => {
    expect(timeEntrySchema.safeParse({ ...base, hours: "0" }).success).toBe(false);
    expect(timeEntrySchema.safeParse({ ...base, hours: "25" }).success).toBe(false);
    expect(timeEntrySchema.safeParse({ ...base, hours: "2", work_date: "15/10/2026" }).success).toBe(false);
  });
});

import { changeOrderCode, changeOrderSchema, indexValueSchema, parseDocumentCodes, stageIndexSchema } from "./validation";

describe("índices", () => {
  it("convierte el mes al primer día", () => {
    expect(indexValueSchema.parse({ name: "ICC Córdoba", period: "2026-07", value: "112,34" })).toEqual({
      name: "ICC Córdoba",
      period: "2026-07-01",
      value: 112.34,
    });
  });
  it("rechaza valor cero y mes inválido", () => {
    expect(indexValueSchema.safeParse({ name: "ICC", period: "2026-07", value: "0" }).success).toBe(false);
    expect(indexValueSchema.safeParse({ name: "ICC", period: "2026-13", value: "1" }).success).toBe(false);
  });
  it("una etapa con índice exige el mes base; sin índice queda todo vacío", () => {
    expect(stageIndexSchema.safeParse({ index_name: "ICC", index_base_period: "" }).success).toBe(false);
    expect(stageIndexSchema.parse({ index_name: "", index_base_period: "2026-01" })).toEqual({
      index_name: null,
      index_base_period: null,
    });
    expect(stageIndexSchema.parse({ index_name: "ICC", index_base_period: "2026-01" }).index_base_period).toBe("2026-01-01");
  });
});

describe("órdenes de cambio", () => {
  const base = { stage_id: "a007cc6b-0c7e-4a43-9a43-1b1b1b1b1b1b", title: "Carpinterías de PVC" };
  it("separa y normaliza los códigos de documentos", () => {
    expect(parseDocumentCodes("a-301, A-302  a-301;e-201")).toEqual(["A-301", "A-302", "E-201"]);
  });
  it("exige monto y acepta horas vacías", () => {
    expect(changeOrderSchema.safeParse({ ...base, amount: "" }).success).toBe(false);
    expect(changeOrderSchema.parse({ ...base, amount: "1.800", hours: "" })).toMatchObject({ amount: 1800, hours: null });
  });
  it("numera OC-001", () => {
    expect(changeOrderCode(1)).toBe("OC-001");
    expect(changeOrderCode(42)).toBe("OC-042");
  });
});
