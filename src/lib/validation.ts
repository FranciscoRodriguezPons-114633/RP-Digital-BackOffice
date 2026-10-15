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
