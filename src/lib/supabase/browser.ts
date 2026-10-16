import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/env";

// Cliente del navegador. Solo para subir archivos a Storage con un link firmado:
// todo lo demás pasa por Server Actions.
export function createBrowserSupabase() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
}
