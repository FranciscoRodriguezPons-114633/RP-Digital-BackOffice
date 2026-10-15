import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type SessionUser = { id: string; email: string };
export type Role = "owner" | "member";
export type CurrentOrg = { id: string; name: string; role: Role };

// Capa de acceso a datos: un solo lugar donde se lee la sesión.
// React `cache` evita repetir la lectura dentro del mismo render.
export const getUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  return { id: claims.sub, email: String(claims.email ?? "") };
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

// MVP: una persona trabaja en un estudio. Si pertenece a varios, se toma el más antiguo.
export const getCurrentOrg = cache(async (): Promise<CurrentOrg | null> => {
  const user = await getUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("memberships")
    .select("role, org_id, created_at, organizations(name)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const org = data.organizations as unknown as { name: string } | null;
  return { id: data.org_id as string, name: org?.name ?? "", role: data.role as Role };
});

// Cantidad de proyectos donde la persona participa como invitado externo.
export const countGuestProjects = cache(async (): Promise<number> => {
  const user = await getUser();
  if (!user) return 0;
  const supabase = await createClient();
  const { count } = await supabase
    .from("project_guests")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);
  return count ?? 0;
});
