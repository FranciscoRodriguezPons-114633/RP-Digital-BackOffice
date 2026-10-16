import { z } from "zod";

// Correo: se recorta y pasa a minúsculas antes de validar, igual que en la base.
export const emailSchema = z
  .string({ error: "Ingresá un correo" })
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: "Ese correo no parece válido" }));

export const loginSchema = z.object({
  email: emailSchema,
  next: z.string().optional(),
});

export const organizationSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, { error: "El nombre necesita al menos 2 caracteres" })
    .max(120, { error: "El nombre puede tener hasta 120 caracteres" }),
});

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { error: `Hasta ${max} caracteres` })
    .optional()
    .transform((v) => (v ? v : null));

export const projectSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, { error: "El nombre necesita al menos 2 caracteres" })
    .max(160, { error: "El nombre puede tener hasta 160 caracteres" }),
  code: optionalText(40),
  client_name: optionalText(160),
});

export const GUEST_KINDS = ["client", "renderer", "contractor"] as const;
export type GuestKind = (typeof GUEST_KINDS)[number];

export const GUEST_KIND_LABEL: Record<GuestKind, string> = {
  client: "Cliente",
  renderer: "Renderista",
  contractor: "Contratista",
};

export const guestInviteSchema = z.object({
  project_id: z.uuid({ error: "Proyecto inválido" }),
  email: emailSchema,
  kind: z.enum(GUEST_KINDS, { error: "Elegí un tipo de invitado" }),
});

export const memberInviteSchema = z.object({
  org_id: z.uuid({ error: "Estudio inválido" }),
  email: emailSchema,
  role: z.enum(["owner", "member"], { error: "Elegí un rol" }).default("member"),
});

export const idSchema = z.uuid();

// Destino seguro después del login: solo rutas internas.
export function safeNext(next: string | null | undefined, fallback = "/") {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return fallback;
  }
  return next;
}

export type FormState = {
  ok?: boolean;
  message?: string;
  errors?: Record<string, string[] | undefined>;
};

export function fieldErrors(error: z.ZodError): FormState {
  return { ok: false, errors: z.flattenError(error).fieldErrors as FormState["errors"] };
}

// ---------------------------------------------------------------------------
// Honorarios y horas
// ---------------------------------------------------------------------------

// Números como los escribe la gente en Argentina: "1.234,50", "1234,5", "7,5" o "7.5".
export function parseDecimal(input: unknown): number | null {
  if (input === null || input === undefined) return null;
  const raw = String(input).trim().replace(/\s|\$|USD|ARS/gi, "");
  if (raw === "") return null;
  let normalized: string;
  if (raw.includes(",")) {
    normalized = raw.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(raw)) {
    normalized = raw.replace(/\./g, ""); // "1.500" = mil quinientos
  } else {
    normalized = raw;
  }
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return Number.NaN;
  return Number(normalized);
}

const decimal = (label: string, { max }: { max?: number } = {}) =>
  z
    .unknown()
    .optional()
    .transform((v) => parseDecimal(v))
    .refine((v) => v === null || !Number.isNaN(v), { error: `${label}: escribí solo números` })
    .refine((v) => v === null || v >= 0, { error: `${label}: no puede ser negativo` })
    .refine((v) => v === null || max === undefined || v <= max, { error: `${label}: hasta ${max}` });

export const STAGE_KINDS = ["fixed", "hourly", "mixed"] as const;
export type StageKind = (typeof STAGE_KINDS)[number];
export const STAGE_KIND_LABEL: Record<StageKind, string> = {
  fixed: "Monto fijo",
  hourly: "Por hora",
  mixed: "Fijo + horas extra",
};
export const CURRENCIES = ["USD", "ARS"] as const;

export const stageSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, { error: "El nombre necesita al menos 2 caracteres" })
      .max(120, { error: "Hasta 120 caracteres" }),
    kind: z.enum(STAGE_KINDS, { error: "Elegí cómo se cobra" }),
    currency: z.enum(CURRENCIES, { error: "Elegí la moneda" }),
    amount: decimal("Monto"),
    hourly_rate: decimal("Tarifa"),
    budget_hours: decimal("Horas", { max: 999999 }),
  })
  .superRefine((s, ctx) => {
    if (s.kind !== "hourly" && s.amount === null) {
      ctx.addIssue({ code: "custom", path: ["amount"], message: "Indicá el monto de la etapa" });
    }
    if (s.kind !== "fixed" && s.hourly_rate === null) {
      ctx.addIssue({ code: "custom", path: ["hourly_rate"], message: "Indicá la tarifa por hora" });
    }
  })
  .transform((s) => ({
    ...s,
    amount: s.kind === "hourly" ? null : s.amount,
    hourly_rate: s.kind === "fixed" ? null : s.hourly_rate,
  }));

export const timeEntrySchema = z.object({
  stage_id: z.uuid({ error: "Elegí la etapa" }),
  hours: decimal("Horas", { max: 24 }).refine((v) => v !== null && v > 0, {
    error: "Indicá cuántas horas",
  }),
  work_date: z.iso.date({ error: "Fecha inválida" }),
  note: z
    .string()
    .trim()
    .max(500, { error: "Hasta 500 caracteres" })
    .optional()
    .transform((v) => (v ? v : null)),
});

// ---------------------------------------------------------------------------
// Índices y órdenes de cambio
// ---------------------------------------------------------------------------

// <input type="month"> manda "2026-07"; la base guarda el primer día del mes.
export const monthSchema = z
  .string({ error: "Elegí el mes" })
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, { error: "Elegí el mes" })
  .transform((m) => `${m}-01`);

export const INDEX_SUGGESTIONS = ["ICC Córdoba", "ICC INDEC", "CAC"] as const;

const indexName = z
  .string()
  .trim()
  .min(2, { error: "El nombre del índice necesita al menos 2 caracteres" })
  .max(60, { error: "Hasta 60 caracteres" });

export const indexValueSchema = z.object({
  name: indexName,
  period: monthSchema,
  value: decimal("Valor").refine((v) => v !== null && v > 0, { error: "Indicá un valor mayor que cero" }),
});

export const stageIndexSchema = z
  .object({
    index_name: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v ? v : null)),
    index_base_period: z
      .string()
      .optional()
      .transform((v) => (v ? v : null)),
  })
  .superRefine((s, ctx) => {
    if (s.index_name && !s.index_base_period) {
      ctx.addIssue({ code: "custom", path: ["index_base_period"], message: "Elegí el mes base del índice" });
    }
    if (s.index_base_period && !/^\d{4}-(0[1-9]|1[0-2])$/.test(s.index_base_period)) {
      ctx.addIssue({ code: "custom", path: ["index_base_period"], message: "Elegí el mes base del índice" });
    }
  })
  .transform((s) =>
    s.index_name && s.index_base_period
      ? { index_name: s.index_name, index_base_period: `${s.index_base_period}-01` }
      : { index_name: null, index_base_period: null },
  );

// "A-301, A-302 a-303" → ["A-301", "A-302", "A-303"]
export function parseDocumentCodes(input: unknown): string[] {
  const codes = String(input ?? "")
    .split(/[\s,;]+/)
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);
  return [...new Set(codes)];
}

export const CHANGE_ORDER_STATUS_LABEL = {
  draft: "Borrador",
  sent: "Enviada",
  approved: "Aprobada",
  rejected: "Rechazada",
  billable: "Para facturar",
  void: "Anulada",
} as const;
export type ChangeOrderStatus = keyof typeof CHANGE_ORDER_STATUS_LABEL;

export const changeOrderSchema = z.object({
  stage_id: z.uuid({ error: "Elegí la etapa" }),
  title: z
    .string()
    .trim()
    .min(3, { error: "El título necesita al menos 3 caracteres" })
    .max(160, { error: "Hasta 160 caracteres" }),
  description: z
    .string()
    .trim()
    .max(4000, { error: "Hasta 4000 caracteres" })
    .optional()
    .transform((v) => (v ? v : null)),
  hours: decimal("Horas", { max: 9999 }),
  amount: decimal("Monto").refine((v) => v !== null, { error: "Indicá el monto del adicional" }),
  affected_documents: z
    .unknown()
    .optional()
    .transform(parseDocumentCodes)
    .refine((codes) => codes.length <= 30, { error: "Hasta 30 documentos" })
    .refine((codes) => codes.every((c) => c.length <= 40), { error: "Cada código, hasta 40 caracteres" }),
});

export const voidSchema = z.object({
  reason: z.string().trim().min(3, { error: "Indicá el motivo" }).max(500, { error: "Hasta 500 caracteres" }),
});

export function changeOrderCode(n: number) {
  return `OC-${String(n).padStart(3, "0")}`;
}
