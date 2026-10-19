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

// Topes de las columnas numeric(14, 2) y numeric(14, 4): más que eso, la base lo rechaza.
const MAX_AMOUNT = 999_999_999_999.99;
const MAX_INDEX_VALUE = 9_999_999_999;

export const indexValueSchema = z.object({
  name: indexName,
  period: monthSchema,
  value: decimal("Valor", { max: MAX_INDEX_VALUE }).refine((v) => v !== null && v > 0, {
    error: "Indicá un valor mayor que cero",
  }),
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
    if (s.index_name && (!s.index_base_period || !monthSchema.safeParse(s.index_base_period).success)) {
      ctx.addIssue({ code: "custom", path: ["index_base_period"], message: "Elegí el mes base del índice" });
    }
  })
  .transform((s) =>
    s.index_name && s.index_base_period
      ? { index_name: s.index_name, index_base_period: monthSchema.parse(s.index_base_period) }
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
  amount: decimal("Monto", { max: MAX_AMOUNT }).refine((v) => v !== null, { error: "Indicá el monto del adicional" }),
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

// ---------------------------------------------------------------------------
// Aprobación por link
// ---------------------------------------------------------------------------

export const LINK_VALID_DAYS = 14;

export const sendChangeOrderSchema = z.object({
  recipient_email: emailSchema,
});

export const DECISIONS = ["approved", "rejected"] as const;
export type Decision = (typeof DECISIONS)[number];

export const decisionSchema = z.object({
  decision: z.enum(DECISIONS, { error: "Elegí aprobar o rechazar" }),
  signer_name: z
    .string({ error: "Escribí tu nombre y apellido" })
    .trim()
    .min(2, { error: "Escribí tu nombre y apellido" })
    .max(120, { error: "Hasta 120 caracteres" }),
  comment: z
    .string()
    .trim()
    .max(1000, { error: "Hasta 1000 caracteres" })
    .optional()
    .transform((v) => (v ? v : null)),
});

// Los tokens son 32 bytes en base64url (43 caracteres). Cualquier otra cosa ni se consulta.
export function isApprovalToken(token: string) {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

// Estado del link que devuelve get_change_order_for_approval.
export type ApprovalLinkState = "valid" | "invalid" | "expired" | "used" | "changed" | "revoked" | "void";

// ---------------------------------------------------------------------------
// Documentos y revisiones
// ---------------------------------------------------------------------------

export const DISCIPLINES = ["architecture", "structure", "mep", "other"] as const;
export type Discipline = (typeof DISCIPLINES)[number];
export const DISCIPLINE_LABEL: Record<Discipline, string> = {
  architecture: "Arquitectura",
  structure: "Estructura",
  mep: "Instalaciones",
  other: "Otra",
};

export const documentSchema = z.object({
  code: z
    .string({ error: "Indicá el código" })
    .trim()
    .min(1, { error: "Indicá el código, por ejemplo A-301" })
    .max(40, { error: "Hasta 40 caracteres" })
    .transform((v) => v.toUpperCase()),
  title: z
    .string({ error: "Indicá el título" })
    .trim()
    .min(2, { error: "El título necesita al menos 2 caracteres" })
    .max(160, { error: "Hasta 160 caracteres" }),
  discipline: z.enum(DISCIPLINES, { error: "Elegí la disciplina" }),
});

export const REVISION_MIME_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"] as const;
export const MAX_REVISION_BYTES = 50 * 1024 * 1024;

// Datos del archivo que el navegador declara antes de subirlo (Storage vuelve a limitar tamaño y tipo).
const fileMetaFields = {
  fileName: z.string().min(1, { error: "Elegí el archivo" }).max(200, { error: "El nombre del archivo es muy largo" }),
  fileSize: z
    .number()
    .int()
    .positive({ error: "El archivo está vacío" })
    .max(MAX_REVISION_BYTES, { error: "El archivo pasa los 50 MB" }),
  mimeType: z.enum(REVISION_MIME_TYPES, { error: "Solo PDF o imágenes (PNG, JPG, WebP)" }),
};
export const fileMetaSchema = z.object(fileMetaFields);

export const revisionUploadSchema = z.object({
  code: z
    .string({ error: "Indicá la revisión" })
    .trim()
    .min(1, { error: "Indicá la revisión, por ejemplo C02" })
    .max(20, { error: "Hasta 20 caracteres" })
    .transform((v) => v.toUpperCase()),
  notes: z
    .string()
    .trim()
    .max(1000, { error: "Hasta 1000 caracteres" })
    .optional()
    .transform((v) => (v ? v : null)),
  ...fileMetaFields,
});

export type RevisionStatus = "draft" | "shared" | "published" | "superseded";
export const REVISION_STATUS_LABEL: Record<RevisionStatus, string> = {
  draft: "Borrador",
  shared: "Compartida",
  published: "Vigente",
  superseded: "Reemplazada",
};

// ---------------------------------------------------------------------------
// Piezas dependientes
// ---------------------------------------------------------------------------

export const PIECE_KINDS = ["render", "sales_plan", "brochure", "other"] as const;
export type PieceKind = (typeof PIECE_KINDS)[number];
export const PIECE_KIND_LABEL: Record<PieceKind, string> = {
  render: "Render",
  sales_plan: "Plano de venta",
  brochure: "Brochure",
  other: "Otra pieza",
};

export type PieceStatus = "current" | "to_review" | "obsolete" | "revalidated";
export const PIECE_STATUS_LABEL: Record<PieceStatus, string> = {
  current: "Vigente",
  to_review: "A revisar",
  obsolete: "Obsoleta",
  revalidated: "Revalidada",
};

export const pieceSchema = z.object({
  source_revision_id: z.uuid({ error: "Elegí la revisión de origen" }),
  kind: z.enum(PIECE_KINDS, { error: "Elegí el tipo de pieza" }),
  title: z
    .string({ error: "Indicá el nombre de la pieza" })
    .trim()
    .min(2, { error: "El nombre necesita al menos 2 caracteres" })
    .max(160, { error: "Hasta 160 caracteres" }),
  responsible_email: z
    .string()
    .trim()
    .toLowerCase()
    .optional()
    .transform((v) => (v ? v : null))
    .pipe(z.email({ error: "Ese correo no parece válido" }).nullable()),
  rounds_contracted: z
    .unknown()
    .optional()
    .transform((v) => (v === undefined || v === null || v === "" ? null : Number(v)))
    .refine((v) => v === null || (Number.isInteger(v) && v >= 0 && v <= 50), { error: "Entre 0 y 50 rondas" }),
});

export const pieceDecisionSchema = z.enum(["revalidated", "obsolete"]);

// ---------------------------------------------------------------------------
// Registro de envíos
// ---------------------------------------------------------------------------

export const SHIPMENT_CHANNELS = ["email", "whatsapp", "other"] as const;
export const SHIPMENT_CHANNEL_LABEL: Record<(typeof SHIPMENT_CHANNELS)[number], string> = {
  email: "Por correo (le avisamos)",
  whatsapp: "Ya se lo mandé por WhatsApp",
  other: "Otro medio (en mano, reunión)",
};

export const shipmentSchema = z
  .object({
    recipient_email: emailSchema,
    channel: z.enum(SHIPMENT_CHANNELS, { error: "Elegí cómo se lo mandás" }),
    note: z
      .string()
      .trim()
      .max(500, { error: "Hasta 500 caracteres" })
      .optional()
      .transform((v) => (v ? v : null)),
    revision_ids: z.array(z.uuid()),
    dependency_ids: z.array(z.uuid()),
  })
  .refine((s) => s.revision_ids.length + s.dependency_ids.length > 0, {
    path: ["files"],
    error: "Elegí al menos un archivo",
  });

// ---------------------------------------------------------------------------
// Comentarios
// ---------------------------------------------------------------------------

export const commentSchema = z.object({
  body: z
    .string({ error: "Escribí el comentario" })
    .trim()
    .min(1, { error: "Escribí el comentario" })
    .max(2000, { error: "Hasta 2000 caracteres" }),
  page: z
    .unknown()
    .optional()
    .transform((v) => (v === undefined || v === null || v === "" ? null : Number(v)))
    .refine((v) => v === null || (Number.isInteger(v) && v >= 1 && v <= 10000), { error: "Página inválida" }),
  // Punto marcado sobre la imagen, de 0 a 1 en cada eje.
  anchor: z
    .object({ x: z.coerce.number().min(0).max(1), y: z.coerce.number().min(0).max(1) })
    .nullable(),
});

// ---------------------------------------------------------------------------
// Vencimientos
// ---------------------------------------------------------------------------

// "30, 15, 5" → [30, 15, 5]
export function parseNotifyDays(input: unknown): number[] {
  return [...new Set(String(input ?? "").split(/[\s,;]+/).filter(Boolean).map(Number))].sort((a, b) => b - a);
}

export const deadlineSchema = z.object({
  project_id: z
    .string()
    .optional()
    .transform((v) => (v ? v : null))
    .pipe(z.uuid().nullable()),
  title: z
    .string({ error: "Indicá qué vence" })
    .trim()
    .min(2, { error: "Al menos 2 caracteres" })
    .max(160, { error: "Hasta 160 caracteres" }),
  due_date: z.iso.date({ error: "Elegí la fecha" }),
  notify_days: z
    .unknown()
    .optional()
    .transform(parseNotifyDays)
    .refine((d) => d.length >= 1 && d.length <= 6, { error: "Entre 1 y 6 avisos" })
    .refine((d) => d.every((n) => Number.isInteger(n) && n >= 1 && n <= 365), { error: "Días entre 1 y 365" }),
  notes: z
    .string()
    .trim()
    .max(1000, { error: "Hasta 1000 caracteres" })
    .optional()
    .transform((v) => (v ? v : null)),
});
