import "server-only";
import { headers } from "next/headers";

// URL pública de la app para armar enlaces (correos, links de aprobación).
// APP_URL manda; si no está, se deduce del pedido.
export async function appOrigin() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
