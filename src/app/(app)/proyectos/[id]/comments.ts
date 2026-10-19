import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/dal";
import type { CommentView } from "../../comment-thread";

// Comentarios del proyecto agrupados por archivo (revisión o pieza). La base devuelve solo
// los de archivos que quien consulta puede ver. `cache` evita repetir la consulta entre secciones.
export const loadComments = cache(async (projectId: string, isMember: boolean) => {
  const [user, supabase] = await Promise.all([getUser(), createClient()]);
  const { data } = await supabase
    .from("comments")
    .select("id, revision_id, dependency_id, author_id, author_email, body, page, anchor, round, status, created_at")
    .eq("project_id", projectId)
    .order("created_at");
  const byFile = new Map<string, CommentView[]>();
  for (const c of (data ?? []) as (Omit<CommentView, "canResolve"> & {
    revision_id: string | null;
    dependency_id: string | null;
    author_id: string;
  })[]) {
    const key = (c.revision_id ?? c.dependency_id)!;
    const view: CommentView = {
      id: c.id,
      author_email: c.author_email,
      body: c.body,
      page: c.page,
      anchor: c.anchor,
      round: c.round,
      status: c.status,
      created_at: c.created_at,
      canResolve: isMember || c.author_id === user?.id,
    };
    byFile.set(key, [...(byFile.get(key) ?? []), view]);
  }
  return byFile;
});
