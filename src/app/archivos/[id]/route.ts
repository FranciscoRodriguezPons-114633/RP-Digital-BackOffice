import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { idSchema } from "@/lib/validation";

// Descarga de una revisión: si quien pide puede leerla (RLS), se lo manda a un link
// firmado de Storage que vence al minuto. El bucket es privado.
export async function GET(_request: NextRequest, ctx: RouteContext<"/archivos/[id]">) {
  const { id } = await ctx.params;
  if (!idSchema.safeParse(id).success) return new NextResponse("No encontrado", { status: 404 });

  const supabase = await createClient();
  const { data: rev } = await supabase
    .from("revisions")
    .select("storage_path, file_name, uploaded_at")
    .eq("id", id)
    .maybeSingle();
  if (!rev?.uploaded_at) return new NextResponse("No encontrado", { status: 404 });

  const { data, error } = await supabase.storage
    .from("documents")
    .createSignedUrl(rev.storage_path, 60, { download: rev.file_name });
  if (error || !data) return new NextResponse("No encontrado", { status: 404 });

  return NextResponse.redirect(data.signedUrl);
}
