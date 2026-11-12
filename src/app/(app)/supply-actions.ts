"use server";

import ExcelJS from "exceljs";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrg, requireUser } from "@/lib/dal";
import { dbErrorMessage } from "@/lib/errors";
import {
  MAX_IMPORT_FILE_BYTES,
  laborSettingSchema,
  parseSupplySheet,
  supplySchema,
  type ImportError,
  type ImportRow,
} from "@/lib/supplies";
import { fieldErrors, idSchema, type FormState } from "@/lib/validation";

// ---------- Alta y edición ----------

export async function saveSupply(id: string | null, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  const org = await getCurrentOrg();
  if (!org) return { ok: false, message: "Primero creá tu organización." };
  if (id !== null && !idSchema.safeParse(id).success) return { ok: false, message: "Insumo inválido." };

  const parsed = supplySchema.safeParse({
    kind: formData.get("kind"),
    code: formData.get("code"),
    name: formData.get("name"),
    unit: formData.get("unit"),
    currency: formData.get("currency") ?? undefined,
    price: formData.get("price") ?? undefined,
    price_date: formData.get("price_date") ?? undefined,
    supplier_party_id: formData.get("supplier_party_id") ?? undefined,
    reference_series_code: formData.get("reference_series_code") ?? undefined,
    // Al crear no hay casilla: queda activo. Al editar, la casilla sin marcar no viaja.
    active: id === null ? undefined : formData.get("active") === "on" ? "on" : "off",
  });
  if (!parsed.success) return fieldErrors(parsed.error);
  const s = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.rpc("upsert_supply", {
    p_org_id: org.id,
    p_id: id,
    p_kind: s.kind,
    p_code: s.code,
    p_name: s.name,
    p_unit: s.unit,
    p_currency: s.currency,
    p_price: s.price,
    p_price_date: s.price_date,
    p_supplier_party_id: s.supplier_party_id,
    p_reference_series_code: s.reference_series_code,
    p_active: s.active,
  });
  if (error?.code === "23505") return { ok: false, errors: { code: [`Ya hay un insumo con el código ${s.code}`] } };
  if (error?.code === "22023" && s.reference_series_code) {
    return { ok: false, errors: { reference_series_code: [error.message] } };
  }
  if (error) return { ok: false, message: dbErrorMessage(error) };

  revalidatePath("/insumos");
  if (id) revalidatePath(`/insumos/${id}`);
  return { ok: true, message: id ? "Cambios guardados." : `${s.code} quedó cargado.` };
}

// ---------- Cargas sociales ----------

export async function saveLaborSetting(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const org = await getCurrentOrg();
  if (!org) return { ok: false, message: "Primero creá tu organización." };
  if (org.role !== "owner") return { ok: false, message: "Solo el dueño cambia el coeficiente de cargas." };
  const parsed = laborSettingSchema.safeParse({
    charges_pct: formData.get("charges_pct"),
    valid_from: formData.get("valid_from"),
  });
  if (!parsed.success) return fieldErrors(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase
    .from("labor_settings")
    .upsert({ ...parsed.data, org_id: org.id, created_by: user.id }, { onConflict: "org_id,valid_from" });
  if (error?.code === "23514") return { ok: false, errors: { valid_from: ["La vigencia no puede ser una fecha futura"] } };
  if (error) return { ok: false, message: dbErrorMessage(error) };

  revalidatePath("/insumos");
  return { ok: true, message: "Coeficiente guardado. La mano de obra atada a la escala ya tiene el precio nuevo." };
}

// ---------- Importación desde Excel ----------

export type ImportCounts = { inserted: number; updated: number; unchanged: number };
export type ImportState = FormState & {
  // Vista previa: qué va a pasar, una muestra de las filas válidas y los errores por fila.
  preview?: {
    fileName: string;
    valid: number;
    counts: ImportCounts;
    sample: Pick<ImportRow, "line" | "code" | "name" | "unit" | "currency" | "price">[];
    errors: ImportError[];
    errorCount: number;
  };
  // Importación hecha.
  done?: boolean;
};

type ImportResponse = ImportCounts & { errors: ImportError[] };

// Una celda de Excel como texto, número o fecha (las fórmulas, por su resultado).
function cellValue(v: ExcelJS.CellValue): unknown {
  if (v === null || v === undefined) return "";
  if (v instanceof Date || typeof v !== "object") return v;
  if ("result" in v) return cellValue(v.result as ExcelJS.CellValue);
  if ("richText" in v) return v.richText.map((t) => t.text).join("");
  if ("text" in v) return v.text;
  return "";
}

async function readSheet(file: File): Promise<unknown[][]> {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(await file.arrayBuffer());
  const ws = book.worksheets[0];
  if (!ws) return [];
  const rows: unknown[][] = [];
  ws.eachRow({ includeEmpty: true }, (row, n) => {
    // row.values empieza en el índice 1.
    rows[n - 1] = (row.values as ExcelJS.CellValue[]).slice(1).map(cellValue);
  });
  return Array.from(rows, (r) => r ?? []);
}

const byLine = (a: ImportError, b: ImportError) => a.line - b.line;
const ERRORS_SHOWN = 50;

// El mismo formulario hace los dos pasos con el mismo archivo: primero la vista previa (no
// escribe nada) y, con el botón de confirmar, la importación. Las filas no viajan de ida y
// vuelta al navegador: el archivo se vuelve a leer y a validar al confirmar.
export async function importSupplies(_prev: ImportState, formData: FormData): Promise<ImportState> {
  await requireUser();
  const org = await getCurrentOrg();
  if (!org) return { ok: false, message: "Primero creá tu organización." };
  if (org.role !== "owner") return { ok: false, message: "Solo el dueño importa listas de precios." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, errors: { file: ["Elegí el archivo de Excel"] } };
  if (file.size > MAX_IMPORT_FILE_BYTES) return { ok: false, errors: { file: ["El archivo pesa más de 800 KB"] } };
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    return { ok: false, errors: { file: ["Tiene que ser un archivo .xlsx (Excel). Si es .xls o .csv, guardalo como .xlsx"] } };
  }
  let sheet: unknown[][];
  try {
    sheet = await readSheet(file);
  } catch {
    return { ok: false, errors: { file: ["No se pudo abrir el archivo: revisá que sea un Excel .xlsx"] } };
  }
  const { rows, errors } = parseSupplySheet(sheet);
  const confirm = formData.get("confirm") === "1";

  let response: ImportResponse = { inserted: 0, updated: 0, unchanged: 0, errors: [] };
  if (rows.length > 0) {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("import_supplies", {
      p_org_id: org.id,
      p_rows: rows,
      p_dry_run: !confirm,
    });
    if (error) return { ok: false, message: dbErrorMessage(error) };
    response = data as ImportResponse;
  }
  // Las filas que la base rechaza (proveedor inexistente, precio atado a una escala) se suman a los errores.
  const rejected = new Set(response.errors.map((e) => e.line));
  const valid = rows.filter((r) => !rejected.has(r.line));
  const allErrors = [...errors, ...response.errors].sort(byLine);
  const counts = { inserted: response.inserted, updated: response.updated, unchanged: response.unchanged };
  const preview = {
    fileName: file.name,
    valid: valid.length,
    counts,
    sample: valid.slice(0, 8).map(({ line, code, name, unit, currency, price }) => ({ line, code, name, unit, currency, price })),
    errors: allErrors.slice(0, ERRORS_SHOWN),
    errorCount: allErrors.length,
  };

  if (!confirm) {
    return valid.length === 0
      ? { ok: false, message: "No hay filas válidas para importar.", preview }
      : { ok: true, preview };
  }
  if (valid.length === 0) return { ok: false, message: "No hay filas válidas para importar.", preview };
  revalidatePath("/insumos");
  const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
  return {
    ok: true,
    done: true,
    preview,
    message: `Listo: ${n(counts.inserted, "insumo nuevo", "insumos nuevos")}, ${n(counts.updated, "precio actualizado", "precios actualizados")} y ${counts.unchanged} sin cambios.`,
  };
}
