import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { GuestKind } from "@/lib/validation";

export type ProjectGuest = {
  id: string;
  email: string;
  kind: GuestKind;
  accepted_at: string | null;
  created_at: string;
};

// Invitados del proyecto, por orden de invitación. Los usan cuatro secciones de la página
// (órdenes, envíos, piezas e invitados): `cache` hace una sola consulta por render.
export const loadProjectGuests = cache(async (projectId: string): Promise<ProjectGuest[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("project_guests")
    .select("id, email, kind, accepted_at, created_at")
    .eq("project_id", projectId)
    .order("created_at");
  return (data ?? []) as ProjectGuest[];
});
