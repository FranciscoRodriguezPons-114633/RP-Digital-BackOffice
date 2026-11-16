import ExcelJS from "exceljs";
import { expect, test } from "@playwright/test";
import { openProject, openProjectSection, signInAs, trackPageErrors } from "./helpers";

// Sprint 8: emitir congela la versión; una versión nueva parte de otra; se comparan; el
// presupuesto se imprime y se exporta a Excel con los mismos totales que la pantalla.
test("un presupuesto se emite, se copia, se compara, se imprime y se exporta", async ({ page }) => {
  const errors = trackPageErrors(page);
  page.on("dialog", (d) => d.accept());
  await signInAs(page, "Ana");
  await openProject(page, "Edificio Alba");
  await openProjectSection(page, "Presupuestos");
  await page.getByLabel("Por ítem").check();
  await page.getByRole("button", { name: "Crear presupuesto" }).click();
  const heading = page.getByRole("heading", { level: 2, name: /Por ítem/ });
  await expect(heading).toBeVisible();
  const first = Number((await heading.textContent())?.match(/V(\d+)/)?.[1]);

  // Un ítem de USD 2.000 y se emite.
  const varios = page.getByRole("region", { name: "Varios" });
  await varios.getByText("Agregar un ítem a Varios").click();
  await varios.getByLabel("Precio directo").check();
  await varios.getByLabel("Precio unitario (USD)").fill("2000");
  await varios.getByLabel("Descripción").fill("Cerco perimetral");
  await varios.getByLabel("Cantidad").fill("1");
  await varios.getByLabel("Unidad").fill("gl");
  await varios.getByRole("button", { name: "Agregar ítem" }).click();
  await expect(varios.getByText("«Cerco perimetral» agregado.")).toBeVisible();
  await page.getByRole("button", { name: "Emitir" }).click();
  await expect(page.getByText(/Emitido el .*los montos quedaron fijos/)).toBeVisible();
  // Emitido: ya no se edita (no hay «Emitir» ni formularios de ítems).
  await expect(page.getByRole("button", { name: "Emitir" })).toHaveCount(0);
  await expect(page.getByText("Este presupuesto ya no está en borrador")).toBeVisible();

  // Versión nueva: arranca en borrador con lo mismo, y se le agrega un ítem.
  await page.getByRole("button", { name: "Nueva versión" }).click();
  await expect(page.getByRole("heading", { level: 2, name: new RegExp(`V${first + 1} · Por ítem`) })).toBeVisible();
  // La versión nueva está en borrador: se puede emitir.
  await expect(page.getByRole("button", { name: "Emitir" })).toBeVisible();
  const nueva = page.getByRole("region", { name: "Varios" });
  await nueva.getByText("Agregar, editar o renombrar").click();
  await nueva.getByLabel("Precio directo").check();
  await nueva.getByLabel("Precio unitario (USD)").fill("500");
  await nueva.getByLabel("Descripción").fill("Limpieza de obra");
  await nueva.getByLabel("Cantidad").fill("1");
  await nueva.getByLabel("Unidad").fill("gl");
  await nueva.getByRole("button", { name: "Agregar ítem" }).click();
  await expect(nueva.getByText("«Limpieza de obra» agregado.")).toBeVisible();
  const summary = page.getByRole("region", { name: "Resumen del presupuesto" });
  await expect(summary.getByRole("row", { name: /^Precio sin IVA/ })).toContainText("USD 2.500");

  // Actualizado por índice (ICC Córdoba del seed, de enero a septiembre: × 1,159), sin cambiar el precio.
  await page.getByRole("link", { name: "Indirectos, honorarios y pase" }).click();
  const ajuste = page.getByRole("region", { name: "Actualizado por índice" });
  await ajuste.getByLabel("Una serie para todo").check();
  await ajuste.getByLabel(/Mes base/).fill("2026-01");
  await ajuste.getByRole("combobox", { name: "Índice" }).selectOption("ICC Córdoba");
  await ajuste.getByRole("button", { name: "Guardar el ajuste" }).click();
  await expect(ajuste.getByText("Ajuste por índice guardado.")).toBeVisible();
  await expect(ajuste.getByText("USD 2.897,50")).toBeVisible();
  await expect(summary.getByRole("row", { name: /^Precio sin IVA/ })).toContainText("USD 2.500");

  // Comparación con la versión de la que salió.
  await page.getByRole("link", { name: "Comparar" }).click();
  await expect(page.getByRole("heading", { name: "1 cambio en los ítems · 1 iguales" })).toBeVisible();
  await expect(page.getByRole("row", { name: /Limpieza de obra/ })).toContainText("Nuevo");
  await expect(page.getByRole("row", { name: /^Precio sin IVA/ })).toContainText("+USD 500");

  // Vista imprimible.
  await page.goBack();
  await page.getByRole("link", { name: "Imprimir o PDF" }).click();
  await expect(page.getByRole("heading", { level: 1, name: `Presupuesto V${first + 1} · Edificio Alba` })).toBeVisible();
  await expect(page.getByRole("button", { name: "Imprimir o guardar PDF" })).toBeVisible();

  // Excel: abre y el precio cuadra con la pantalla.
  const url = new URL(page.url());
  const response = await page.request.get(url.pathname.replace(/\/imprimir$/, "/exportar"));
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("spreadsheetml");
  const book = new ExcelJS.Workbook();
  const body = await response.body();
  await book.xlsx.load(body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer);
  expect(book.worksheets.map((w) => w.name)).toEqual(["Resumen", "Rubros e ítems", "Análisis usados", "Personal e indirectos"]);
  const resumen = book.getWorksheet("Resumen")!;
  let price: unknown = null;
  resumen.eachRow((row) => {
    if (row.getCell(1).value === "Precio sin IVA") price = row.getCell(2).value;
  });
  expect(price).toBe(2500);
  expect(errors).toEqual([]);
});
