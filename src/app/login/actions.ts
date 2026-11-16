"use server";

import { createClient } from "@/lib/supabase/server";
import { appOrigin } from "@/lib/origin";
import { RATE_LIMITED_MESSAGE, clientIp, withinRateLimit } from "@/lib/rate-limit";
import { loginSchema, safeNext, fieldErrors, type FormState } from "@/lib/validation";

export async function sendMagicLink(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    next: formData.get("next") ?? undefined,
  });
  if (!parsed.success) return fieldErrors(parsed.error);

  // Cupo por IP y por correo antes de que Supabase mande nada.
  if (
    !(await withinRateLimit("login_ip", await clientIp())) ||
    !(await withinRateLimit("login_email", parsed.data.email))
  ) {
    return { ok: false, message: RATE_LIMITED_MESSAGE };
  }

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
