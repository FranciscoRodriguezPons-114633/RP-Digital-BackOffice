import ExcelJS from "exceljs";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrg } from "@/lib/dal";
import { sumAmounts } from "@/lib/format";
import { CHANGE_ORDER_STATUS_LABEL, STAGE_KIND_LABEL, changeOrderCode, idSchema, type ChangeOrderStatus, type StageKind } from "@/lib/validation";

// Excel del proyecto para facturar: etapas con su honorario actualizado y adicionales,
// horas cargadas y órdenes de cambio. Los totales salen de la misma vista que el panel.

type Stage = {
  id: string;
  name: string;
  kind: StageKind;
  currency: string;
  amount: string | null;
  hourly_rate: string | null;
  budget_hours: string | null;
  hours_used: string;
  fee_amount: string | null;
  index_name: string | null;
  fee_adjusted: string | null;
  extras_approved: string;
  total_amount: string | null;
};

const money = (v: string | number | null | undefined) => (v === null || v === undefined || v === "" ? null : Number(v));
const MONEY_FMT = "#,##0.00";

function sheet(book: ExcelJS.Workbook, name: string, columns: { header: string; key: string; width: number; money?: boolean }[]) {
  const ws = book.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width, style: c.money ? { numFmt: MONEY_FMT } : {} }));
  ws.getRow(1).font = { bold: true };
  return ws;
}

export async function GET(_request: NextRequest, ctx: RouteContext<"/proyectos/[id]/exportar">) {
  const { id } = await ctx.params;
  if (!idSchema.safeParse(id).success) return new NextResponse("No encontrado", { status: 404 });

  const supabase = await createClient();
  const [{ data: project }, org] = await Promise.all([
    supabase.from("projects").select("id, org_id, name, code").eq("id", id).maybeSingle(),
    getCurrentOrg(),
  ]);
  if (!project || !org || org.id !== project.org_id) return new NextResponse("No encontrado", { status: 404 });

  const [{ data: stageData }, { data: hourData }, { data: orderData }, { data: members }] = await Promise.all([
    supabase
      .from("fee_stage_summary")
      .select("id, name, kind, currency, amount, hourly_rate, budget_hours, hours_used, fee_amount, index_name, fee_adjusted, extras_approved, total_amount")
      .eq("project_id", id)
      .order("position"),
    supabase
      .from("time_entries")
      .select("work_date, hours, note, user_id, fee_stages(name)")
      .eq("project_id", id)
      .order("work_date"),
    supabase
      .from("change_orders")
      .select("number, title, status, amount, currency, hours, decided_at, fee_stages(name), approvals(signer_name, signer_email, created_at)")
      .eq("project_id", id)
      .order("number"),
    supabase.rpc("list_org_members", { p_org_id: org.id }),
  ]);
  const stages = (stageData ?? []) as Stage[];
  const emails = new Map(((members ?? []) as { user_id: string; email: string }[]).map((m) => [m.user_id, m.email]));

  const book = new ExcelJS.Workbook();
  book.creator = "RP Backoffice";
  book.created = new Date();

  const ws1 = sheet(book, "Etapas", [
    { header: "Etapa", key: "name", width: 30 },
    { header: "Tipo", key: "kind", width: 18 },
    { header: "Moneda", key: "currency", width: 8 },
    { header: "Monto", key: "amount", width: 14, money: true },
    { header: "Tarifa por hora", key: "rate", width: 14, money: true },
    { header: "Horas previstas", key: "budget", width: 14 },
    { header: "Horas cargadas", key: "used", width: 14 },
    { header: "Honorario", key: "fee", width: 14, money: true },
    { header: "Índice", key: "index", width: 14 },
    { header: "Honorario actualizado", key: "adjusted", width: 18, money: true },
    { header: "Adicionales aprobados", key: "extras", width: 18, money: true },
    { header: "Total", key: "total", width: 16, money: true },
  ]);
  for (const s of stages) {
    ws1.addRow({
      name: s.name,
      kind: STAGE_KIND_LABEL[s.kind],
      currency: s.currency,
      amount: money(s.amount),
      rate: money(s.hourly_rate),
      budget: money(s.budget_hours),
      used: money(s.hours_used),
      fee: money(s.fee_amount),
      index: s.index_name ?? "",
      adjusted: money(s.fee_adjusted),
      extras: money(s.extras_approved),
      total: money(s.total_amount),
    });
  }
  // Totales por moneda, sumados al centavo (los mismos que muestra el proyecto).
  for (const currency of [...new Set(stages.map((s) => s.currency))].sort()) {
    const rows = stages.filter((s) => s.currency === currency);
    const row = ws1.addRow({
      name: `Total ${currency}`,
      currency,
      extras: sumAmounts(rows.map((r) => r.extras_approved)),
      total: sumAmounts(rows.map((r) => r.total_amount)),
    });
    row.font = { bold: true };
  }

  const ws2 = sheet(book, "Horas", [
    { header: "Fecha", key: "date", width: 12 },
    { header: "Etapa", key: "stage", width: 30 },
    { header: "Persona", key: "person", width: 28 },
    { header: "Horas", key: "hours", width: 8 },
    { header: "Nota", key: "note", width: 40 },
  ]);
  for (const h of (hourData ?? []) as unknown as { work_date: string; hours: string; note: string | null; user_id: string; fee_stages: { name: string } | null }[]) {
    ws2.addRow({
      date: new Date(`${h.work_date}T12:00:00Z`),
      stage: h.fee_stages?.name ?? "",
      person: emails.get(h.user_id) ?? "",
      hours: Number(h.hours),
      note: h.note ?? "",
    });
  }
  ws2.getColumn("date").numFmt = "dd/mm/yyyy";

  const ws3 = sheet(book, "Adicionales", [
    { header: "Orden", key: "code", width: 10 },
    { header: "Qué se pidió", key: "title", width: 36 },
    { header: "Etapa", key: "stage", width: 26 },
    { header: "Estado", key: "status", width: 14 },
    { header: "Moneda", key: "currency", width: 8 },
    { header: "Monto", key: "amount", width: 14, money: true },
    { header: "Horas", key: "hours", width: 8 },
    { header: "Decidida", key: "decided", width: 14 },
    { header: "Aprobó o rechazó", key: "signer", width: 34 },
  ]);
  type Order = {
    number: number;
    title: string;
    status: ChangeOrderStatus;
    amount: string;
    currency: string;
    hours: string | null;
    decided_at: string | null;
    fee_stages: { name: string } | null;
    approvals: { signer_name: string; signer_email: string; created_at: string }[];
  };
  for (const o of (orderData ?? []) as unknown as Order[]) {
    const last = o.approvals.at(-1);
    ws3.addRow({
      code: changeOrderCode(o.number),
      title: o.title,
      stage: o.fee_stages?.name ?? "",
      status: CHANGE_ORDER_STATUS_LABEL[o.status],
      currency: o.currency,
      amount: Number(o.amount),
      hours: money(o.hours),
      decided: o.decided_at ? new Date(o.decided_at) : null,
      signer: last ? `${last.signer_name} (${last.signer_email})` : "",
    });
  }
  ws3.getColumn("decided").numFmt = "dd/mm/yyyy";

  const buffer = await book.xlsx.writeBuffer();
  const name = `${project.code ? `${project.code} ` : ""}${project.name}`.replace(/[^\p{L}\p{N} ._-]+/gu, "").trim() || "proyecto";
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${name}.xlsx`)}`,
      "Cache-Control": "no-store",
    },
  });
}
