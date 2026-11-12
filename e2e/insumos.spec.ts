import ExcelJS from "exceljs";
import { expect, test } from "@playwright/test";
import { signInAs } from "./helpers";

// Arma en memoria una lista de precios como la plantilla, con una fila inválida.
async function priceList(prefix: string) {
  const book = new ExcelJS.Workbook();
  const ws = book.addWorksheet("Insumos");
  ws.addRow(["Tipo", "Código", "Nombre", "Unidad", "Moneda", "Precio", "Fecha", "CUIT del proveedor"]);
  ws.addRow(["Material", `${prefix}-ARENA`, "Arena fina", "m3", "ARS", 42000, new Date(Date.UTC(2026, 10, 10))]);
  ws.addRow(["Material", `${prefix}-CAL`, "Cal hidráulica x 25 kg", "bolsa", "ARS", "4.850,50", "10/11/2026"]);
  ws.addRow(["Equipo", `${prefix}-ANDAMIO`, "Andamio tubular", "día", "USD", 3.75, "2026-11-10"]);
  ws.addRow(["Material", `${prefix}-MAL`, "Sin precio", "u", "ARS", 0, "10/11/2026"]);
  return Buffer.from(await book.xlsx.writeBuffer());
}

test("el dueño importa una lista de precios desde Excel, con vista previa", async ({ page }) => {
  // Códigos distintos en cada corrida: la prueba no depende de lo que ya haya en la base.
  const prefix = `E${Date.now().toString(36).toUpperCase()}`;
  await signInAs(page, "Ana");
  await page.goto("/insumos/importar");

  await page.getByLabel("Archivo de Excel (.xlsx)").setInputFiles({
    name: "lista-de-precios.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: await priceList(prefix),
  });
  await page.getByRole("button", { name: "Ver vista previa" }).click();

  // Vista previa: tres filas entran, una se marca y todavía no se guardó nada.
  await expect(page.getByText("lista-de-precios.xlsx: 3 filas válidas, 1 con errores")).toBeVisible();
  await expect(page.getByText("3 insumos nuevos · 0 cambian de precio · 0 sin cambios")).toBeVisible();
  await expect(page.getByText("Fila 5: El precio tiene que ser mayor que cero")).toBeVisible();

  await page.getByRole("button", { name: "Importar 3 filas" }).click();
  await expect(page.getByText(/Listo: 3 insumos nuevos, 0 precios actualizados y 0 sin cambios/)).toBeVisible();

  // Quedan en la biblioteca, y la búsqueda por código los encuentra.
  await page.goto(`/insumos?q=${prefix}`);
  await expect(page.getByRole("link", { name: "Cal hidráulica x 25 kg" })).toBeVisible();
  await expect(page.getByText("ARS 4.850,50")).toBeVisible();
  await expect(page.getByText("3 insumos", { exact: true })).toBeVisible();
});

test("la mano de obra toma el precio de la escala UOCRA más las cargas", async ({ page }) => {
  const code = `MO${Date.now().toString(36).toUpperCase()}`;
  await signInAs(page, "Ana");
  await page.goto("/insumos");

  // El formulario arranca abierto solo cuando la biblioteca está vacía.
  if (!(await page.getByLabel("Código", { exact: true }).isVisible())) await page.getByText("Nuevo insumo").click();
  await page.getByRole("combobox", { name: "Tipo", exact: true }).selectOption({ label: "Mano de obra" });
  await page.getByLabel("Código", { exact: true }).fill(code);
  await page.getByLabel("Unidad", { exact: true }).fill("h");
  await page.getByLabel("Nombre", { exact: true }).fill("Ayudante de obra");
  await page.getByLabel("De dónde sale el precio").selectOption({ label: "Escala UOCRA ayudante" });
  // Con la escala elegida, el precio no se escribe: lo calcula la base.
  await expect(page.getByLabel("Precio", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Cargar insumo" }).click();
  await expect(page.getByText(`${code} quedó cargado.`)).toBeVisible();

  await page.goto(`/insumos?q=${code}`);
  await expect(page.getByText("precio de la escala salarial")).toBeVisible();
});
