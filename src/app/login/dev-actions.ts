"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DEV_LOGIN_ENABLED, DEV_PASSWORD, DEV_USERS } from "@/lib/env";

export async function devSignIn(formData: FormData) {
  if (!DEV_LOGIN_ENABLED) throw new Error("No disponible");

  const email = String(formData.get("email") ?? "");
  if (!DEV_USERS.some((u) => u.email === email)) throw new Error("Usuario de prueba desconocido");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password: DEV_PASSWORD });
  if (error) {
    redirect("/login?error=dev");
  }
  await supabase.rpc("claim_invitations");
  redirect("/");
}
