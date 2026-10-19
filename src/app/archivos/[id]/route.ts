import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { FILES_BUCKET } from "@/lib/storage";
import { idSchema } from "@/lib/validation";

// Descarga de una revisión o pieza: si quien pide puede leerla (RLS), se lo manda a un link
// firmado de Storage que vence al minuto. El bucket es privado.
export async function GET(_request: NextRequest, ctx: RouteContext<"/archivos/[id]">) {
  const { id } = await ctx.params;
  if (!idSchema.safeParse(id).success) return new NextResponse("No encontrado", { status: 404 });

  const supabase = await createClient();
  // El id puede ser de una revisión o de una pieza dependiente.
  const select = "storage_path, file_name, uploaded_at";
  const { data: revision } = await supabase.from("revisions").select(select).eq("id", id).maybeSingle();
  const rev = revision ?? (await supabase.from("dependencies").select(select).eq("id", id).maybeSingle()).data;
  if (!rev?.uploaded_at || !rev.storage_path) return new NextResponse("No encontrado", { status: 404 });

  const { data, error } = await supabase.storage
    .from(FILES_BUCKET)
    .createSignedUrl(rev.storage_path, 60, { download: rev.file_name });
  if (error || !data) return new NextResponse("No encontrado", { status: 404 });

  // Si se lo enviaron a quien lo abre, queda anotado (para el registro de envíos).
  await supabase.rpc("record_file_open", { p_file_id: id });
  return NextResponse.redirect(data.signedUrl);
}
