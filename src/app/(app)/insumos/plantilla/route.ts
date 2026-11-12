import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { getCurrentOrg, hasWorks } from "@/lib/dal";
import { todayInCordoba } from "@/lib/format";
import { IMPORT_COLUMNS } from "@/lib/supplies";

// Plantilla de Excel para importar insumos: los encabezados que reconoce la importación y
// tres filas de ejemplo (se pisan o se borran).
export async function GET() {
  const org = await getCurrentOrg();
  if (!org || !hasWorks(org)) return new NextResponse("No encontrado", { status: 404 });

  const book = new ExcelJS.Workbook();
  const ws = book.addWorksheet("Insumos", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = IMPORT_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  ws.getRow(1).font = { bold: true };
  const today = new Date(`${todayInCordoba()}T00:00:00Z`);
  ws.addRows([
    { kind: "Material", code: "MAT-001", name: "Cemento Portland x 50 kg", unit: "bolsa", currency: "ARS", price: 9500, price_date: today },
    { kind: "Mano de obra", code: "MO-001", name: "Oficial albañil", unit: "h", currency: "ARS", price: 6600, price_date: today },
    { kind: "Equipo", code: "EQ-001", name: "Hormigonera 130 l", unit: "día", currency: "USD", price: 12.5, price_date: today },
  ]);
  ws.getColumn("price").numFmt = "#,##0.00##";
  ws.getColumn("price_date").numFmt = "dd/mm/yyyy";

  const buffer = await book.xlsx.writeBuffer();
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="plantilla-insumos.xlsx"',
      "Cache-Control": "private, no-store",
    },
  });
}
