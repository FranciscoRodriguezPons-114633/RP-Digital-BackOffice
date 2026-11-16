import ExcelJS from "exceljs";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrg, hasWorks } from "@/lib/dal";
import { COST_CLASSES, COST_CLASS_LABEL, OVERHEAD_KIND_LABEL } from "@/lib/budgets";
import { BUDGET_LEVEL_LABEL, BUDGET_STATUS_LABEL, idSchema } from "@/lib/validation";
import { summaryLines } from "../budget-summary";
import { loadBudgetDocument } from "../budget-document";

// Excel del presupuesto: resumen, rubros e ítems, análisis usados y personal e indirectos.
// Los montos salen de las mismas vistas que la pantalla, así los totales cuadran.

const MONEY_FMT = "#,##0.00";
const QTY_FMT = "#,##0.####";

function sheet(book: ExcelJS.Workbook, name: string, columns: { header: string; key: string; width: number; fmt?: string }[]) {
  const ws = book.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width, style: c.fmt ? { numFmt: c.fmt } : {} }));
  ws.getRow(1).font = { bold: true };
  return ws;
}

// Nombre de archivo sin caracteres que el sistema operativo no acepta.
const fileName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();

export async function GET(_request: NextRequest, ctx: RouteContext<"/proyectos/[id]/presupuestos/[budgetId]/exportar">) {
  const { id, budgetId } = await ctx.params;
  if (!idSchema.safeParse(id).success || !idSchema.safeParse(budgetId).success) {
    return new NextResponse("No encontrado", { status: 404 });
  }
  const supabase = await createClient();
  const [{ data: project }, org] = await Promise.all([
    supabase.from("projects").select("id, org_id, name, code, client_name").eq("id", id).maybeSingle(),
    getCurrentOrg(),
  ]);
  if (!project || !org || org.id !== project.org_id || !hasWorks(org)) return new NextResponse("No encontrado", { status: 404 });
  const doc = await loadBudgetDocument(id, budgetId);
  if (!doc) return new NextResponse("No encontrado", { status: 404 });
  const { budget, totals, chapters, overheads, analyses } = doc;
  const cur = budget.currency;

  const book = new ExcelJS.Workbook();
  book.creator = "RP Backoffice";
  book.created = new Date();

  // Resumen
  const resumen = sheet(book, "Resumen", [
    { header: "Concepto", key: "label", width: 44 },
    { header: `Monto (${cur})`, key: "amount", width: 18, fmt: MONEY_FMT },
    { header: "Parte del costo directo", key: "share", width: 22 },
  ]);
  const info: [string, string][] = [
    ["Proyecto", [project.name, project.code].filter(Boolean).join(" · ")],
    ["Comitente", project.client_name ?? ""],
    ["Versión", `V${budget.number} · ${BUDGET_LEVEL_LABEL[budget.level]} · ${BUDGET_STATUS_LABEL[budget.status]}`],
    ["Moneda", cur],
    ["Superficie ponderada (m²)", String(Number(totals.weighted_m2)).replace(".", ",")],
    ["Tipo de cambio (pesos por dólar)", budget.exchange_rate ? String(Number(budget.exchange_rate)).replace(".", ",") : "sin cargar"],
  ];
  for (const [label, value] of info) resumen.addRow({ label, share: value });
  resumen.addRow({});
  for (const l of summaryLines(totals)) {
    const row = resumen.addRow({ label: l.label, amount: l.amount, share: l.share ?? "" });
    if (l.strong) row.font = { bold: true };
  }
  resumen.addRow({ label: "Precio sin IVA por m²", amount: totals.price_per_m2 === null ? null : Number(totals.price_per_m2) });

  // Rubros e ítems
  const items = sheet(book, "Rubros e ítems", [
    { header: "N°", key: "n", width: 7 },
    { header: "Rubro", key: "chapter", width: 26 },
    { header: "Ítem", key: "description", width: 40 },
    { header: "Análisis", key: "analysis", width: 14 },
    { header: "Unidad", key: "unit", width: 9 },
    { header: "Cantidad", key: "quantity", width: 12, fmt: QTY_FMT },
    { header: "Unitario", key: "unit_price", width: 14, fmt: MONEY_FMT },
    ...COST_CLASSES.map((c) => ({ header: COST_CLASS_LABEL[c], key: c, width: 14, fmt: MONEY_FMT })),
    { header: "Total", key: "total", width: 16, fmt: MONEY_FMT },
  ]);
  chapters.forEach((c, ci) => {
    c.items.forEach((i, ii) => {
      const total = Number(i.cost?.total ?? 0);
      items.addRow({
        n: `${ci + 1}.${ii + 1}`,
        chapter: c.name,
        description: i.description,
        analysis: i.unit_analyses?.code ?? "",
        unit: i.unit,
        quantity: Number(i.quantity),
        unit_price: Math.round((total / Number(i.quantity)) * 100) / 100,
        ...Object.fromEntries(COST_CLASSES.map((k) => [k, Number(i.cost?.[k] ?? 0)])),
        total,
      });
    });
    if (c.items.length > 0) {
      items.addRow({ chapter: c.name, description: `Subtotal ${c.name}`, total: c.subtotal }).font = { bold: true };
    }
  });
  items.addRow({
    description: "Costo directo",
    ...Object.fromEntries(COST_CLASSES.map((k) => [k, Number(totals[k] ?? 0)])),
    total: Number(totals.total),
  }).font = { bold: true };

  // Análisis usados (costo por unidad en la moneda del presupuesto)
  const apu = sheet(book, "Análisis usados", [
    { header: "Código", key: "code", width: 16 },
    { header: "Análisis", key: "name", width: 40 },
    { header: "Unidad", key: "unit", width: 9 },
    { header: `Materiales (${cur})`, key: "materials", width: 16, fmt: MONEY_FMT },
    { header: `Mano de obra (${cur})`, key: "labor", width: 16, fmt: MONEY_FMT },
    { header: `Equipos (${cur})`, key: "equipment", width: 16, fmt: MONEY_FMT },
    { header: `Por unidad (${cur})`, key: "total", width: 16, fmt: MONEY_FMT },
  ]);
  for (const a of analyses) {
    apu.addRow({ ...a, total: Math.round((a.materials + a.labor + a.equipment) * 100) / 100 });
  }
  if (analyses.length === 0) apu.addRow({ name: "El presupuesto no usa análisis de precios." });

  // Personal e indirectos
  const ov = sheet(book, "Personal e indirectos", [
    { header: "Concepto", key: "concept", width: 40 },
    { header: "Tipo", key: "kind", width: 18 },
    { header: "Meses", key: "months", width: 10, fmt: QTY_FMT },
    { header: `Por mes (${cur})`, key: "monthly", width: 16, fmt: MONEY_FMT },
    { header: `Total (${cur})`, key: "total", width: 16, fmt: MONEY_FMT },
  ]);
  for (const o of overheads) {
    ov.addRow({
      concept: o.concept,
      kind: OVERHEAD_KIND_LABEL[o.kind],
      months: Number(o.months),
      monthly: o.monthly_cost === null ? null : Number(o.monthly_cost),
      total: o.monthly_cost === null ? null : Math.round(Number(o.months) * Number(o.monthly_cost) * 100) / 100,
    });
  }
  ov.addRow({
    concept: "Total",
    total: Math.round((Number(totals.overheads_staff) + Number(totals.overheads_indirect)) * 100) / 100,
  }).font = { bold: true };

  const buffer = await book.xlsx.writeBuffer();
  const name = fileName(`Presupuesto V${budget.number} ${project.name}`);
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name.replace(/[^\x20-\x7e]/g, "_")}.xlsx"; filename*=UTF-8''${encodeURIComponent(name)}.xlsx`,
      "Cache-Control": "no-store",
    },
  });
}
