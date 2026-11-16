import "server-only";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { captureException } from "@/lib/error-report";

// Límites de pedidos en /login y /aprobar. Los cupos están en la base
// (public.hit_rate_limit, migración 20261120): acá solo se elige el tipo y la clave.
export type RateLimitBucket = "login_ip" | "login_email" | "approval_view" | "approval_decide";

export const RATE_LIMITED_MESSAGE = "Hiciste muchos pedidos seguidos. Esperá unos minutos y probá de nuevo.";

// IP de quien pide. En Vercel, el primer valor de x-forwarded-for es el del cliente.
export async function clientIp(): Promise<string | null> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
}

// true si el pedido puede seguir. Si la consulta falla, deja pasar y lo registra:
// un límite roto no puede dejar a nadie afuera.
export async function withinRateLimit(bucket: RateLimitBucket, key: string | null): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("hit_rate_limit", {
    p_bucket: bucket,
    p_key: key || "sin-ip",
    p_secret: process.env.RATE_LIMIT_SECRET || null,
  });
  if (error) {
    await captureException(new Error(`Límite de pedidos ${bucket} sin respuesta: ${error.code ?? ""} ${error.message}`));
    return true;
  }
  return data !== false;
}
