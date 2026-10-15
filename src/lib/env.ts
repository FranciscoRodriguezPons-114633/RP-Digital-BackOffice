// Variables públicas: se leen de forma estática para que Next las inyecte en el cliente.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

export function assertSupabaseEnv() {
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Copiá .env.example a .env.local.",
    );
  }
}

// Ingreso rápido sin correo: solo en `next dev` y contra un Supabase local.
// Usa los usuarios de supabase/seed.sql, que no existen en la nube.
export const DEV_LOGIN_ENABLED =
  process.env.NODE_ENV === "development" &&
  /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(SUPABASE_URL);

export const DEV_USERS = [
  { email: "ana@estudio.test", label: "Ana · dueña del estudio" },
  { email: "beto@estudio.test", label: "Beto · miembro del estudio" },
  { email: "cliente@estudio.test", label: "Cliente invitado" },
] as const;

export const DEV_PASSWORD = "dev-password-local";
