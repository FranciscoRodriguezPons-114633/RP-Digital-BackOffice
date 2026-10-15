import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, assertSupabaseEnv } from "@/lib/env";

// Cliente para Server Components, Server Actions y Route Handlers.
// Lee cookies, así que todo lo que lo use tiene que estar dentro de <Suspense>.
// `connection()` deja todo lo que sigue fuera del prerender: supabase-js compara
// la expiración del token con la hora actual, y eso solo puede pasar por pedido.
export async function createClient() {
  await connection();
  const cookieStore = await cookies();
  assertSupabaseEnv();

  return createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Llamado desde un Server Component: no se pueden escribir cookies.
          // El proxy se encarga de refrescar la sesión.
        }
      },
    },
  });
}
