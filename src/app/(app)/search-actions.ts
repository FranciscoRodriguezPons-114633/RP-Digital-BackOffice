"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentOrg, hasWorks, requireUser } from "@/lib/dal";

export type SearchResult = { href: string; title: string; detail: string; group: string };

const LIMIT = 6;

// Buscador ⌘K: pocos resultados por tipo, de lo que la persona puede ver (lo filtra la RLS).
export async function searchApp(term: string): Promise<SearchResult[]> {
  await requireUser();
  // El texto va dentro de un filtro `or`: se sacan los caracteres que lo romperían.
  const q = String(term ?? "").replace(/[,()%*\\"]/g, " ").trim().slice(0, 60);
  if (q.length < 2) return [];
  const [org, supabase] = await Promise.all([getCurrentOrg(), createClient()]);
  const works = hasWorks(org);
  const like = `%${q}%`;

  const [projects, supplies, analyses, parties] = await Promise.all([
    supabase
      .from("projects")
      .select("id, name, code, client_name")
      .or(`name.ilike.${like},code.ilike.${like},client_name.ilike.${like}`)
      .order("name")
      .limit(LIMIT),
    works && org
      ? supabase.from("supplies").select("id, code, name, unit").eq("org_id", org.id).or(`code.ilike.${like},name.ilike.${like}`).order("code").limit(LIMIT)
      : Promise.resolve({ data: [] }),
    works && org
      ? supabase.from("unit_analyses").select("id, code, name, unit").eq("org_id", org.id).or(`code.ilike.${like},name.ilike.${like}`).order("code").limit(LIMIT)
      : Promise.resolve({ data: [] }),
    works && org
      ? supabase.from("parties").select("id, name, tax_id").eq("org_id", org.id).or(`name.ilike.${like},tax_id.ilike.${like}`).order("name").limit(LIMIT)
      : Promise.resolve({ data: [] }),
  ]);

  return [
    ...((projects.data ?? []) as { id: string; name: string; code: string | null; client_name: string | null }[]).map((p) => ({
      href: `/proyectos/${p.id}`,
      title: p.name,
      detail: [p.code, p.client_name].filter(Boolean).join(" · "),
      group: "Proyectos",
    })),
    ...((supplies.data ?? []) as { id: string; code: string; name: string; unit: string }[]).map((s) => ({
      href: `/insumos/${s.id}`,
      title: s.name,
      detail: `${s.code} · ${s.unit}`,
      group: "Insumos",
    })),
    ...((analyses.data ?? []) as { id: string; code: string; name: string; unit: string }[]).map((a) => ({
      href: `/analisis-de-precios/${a.id}`,
      title: a.name,
      detail: `${a.code} · por ${a.unit}`,
      group: "Análisis de precios",
    })),
    ...((parties.data ?? []) as { id: string; name: string; tax_id: string | null }[]).map((p) => ({
      href: "/terceros",
      title: p.name,
      detail: p.tax_id ? `CUIT ${p.tax_id}` : "Tercero",
      group: "Terceros",
    })),
  ];
}
