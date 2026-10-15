"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { loginSchema, safeNext, fieldErrors, type FormState } from "@/lib/validation";

async function appOrigin() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function sendMagicLink(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    next: formData.get("next") ?? undefined,
  });
  if (!parsed.success) return fieldErrors(parsed.error);

  const next = safeNext(parsed.data.next);
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      emailRedirectTo: `${await appOrigin()}/auth/callback?next=${encodeURIComponent(next)}`,
      shouldCreateUser: true,
    },
  });

  if (error) {
    // Supabase limita a un pedido por minuto por correo.
    const tooMany = error.status === 429 || /rate|seconds/i.test(error.message);
    return {
      ok: false,
      message: tooMany
        ? "Ya te mandamos un enlace hace muy poco. Esperá un minuto y probá de nuevo."
        : "No pudimos enviar el enlace. Probá de nuevo en un momento.",
    };
  }

  return {
    ok: true,
    message: `Te mandamos un enlace a ${parsed.data.email}. Abrilo desde este dispositivo; vence en una hora.`,
  };
}
