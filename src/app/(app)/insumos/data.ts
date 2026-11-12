import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { LaborSeries } from "../supply-forms";

// Lo que necesitan los formularios de insumos: proveedores, escalas salariales con valores y el
// coeficiente de cargas vigente. `cache`: la lista y el formulario de alta lo piden una sola vez.
export const loadSupplyFormData = cache(async (orgId: string) => {
  const supabase = await createClient();
  const [{ data: supplierData }, { data: seriesData }, { data: laborData }] = await Promise.all([
    supabase
      .from("parties")
      .select("id, name")
      .eq("org_id", orgId)
      .overlaps("roles", ["supplier", "subcontractor"])
      .order("name"),
    supabase
      .from("reference_series_summary")
      .select("code, name, last_value, last_period")
      .eq("unit", "ARS por hora")
      .not("last_value", "is", null)
      .order("position"),
    supabase
      .from("labor_settings")
      .select("charges_pct, valid_from")
      .eq("org_id", orgId)
      .order("valid_from", { ascending: false })
      .limit(1),
  ]);
  const labor = (laborData ?? [])[0] as { charges_pct: string; valid_from: string } | undefined;
  return {
    suppliers: (supplierData ?? []) as { id: string; name: string }[],
    laborSeries: (seriesData ?? []) as LaborSeries[],
    chargesPct: labor ? Number(labor.charges_pct) : null,
    chargesFrom: labor?.valid_from ?? null,
  };
});
