import { expect, test } from "@playwright/test";
import { openDisclosure, openProject, signInAs, trackPageErrors } from "./helpers";

// Presupuesto por ítem de Edificio Alba (ficha en dólares del seed), con precios directos.
test("se arma un presupuesto por ítem y el total cierra con el desglose", async ({ page }) => {
  const errors = trackPageErrors(page);
  await signInAs(page, "Ana");
  await openProject(page, "Edificio Alba");
  await page.getByRole("link", { name: "Presupuestos", exact: true }).click();

  await page.getByLabel("Por ítem").check();
  await page.getByRole("button", { name: "Crear presupuesto" }).click();
  await expect(page.getByRole("heading", { level: 2, name: /Por ítem/ })).toBeVisible();

  // Un ítem de materiales y uno subcontratado, en el rubro Varios.
  const varios = page.getByRole("region", { name: "Varios" });
  await varios.getByText("Agregar un ítem a Varios").click();
  await varios.getByLabel("Precio directo").check();
  await varios.getByLabel("Precio unitario (USD)").fill("1.234,50");
  await varios.getByLabel("Descripción").fill("Cerco de obra");
  await varios.getByLabel("Cantidad").fill("2");
  await varios.getByLabel("Unidad").fill("gl");
  // Monto en vivo, antes de guardar.
  await expect(varios.getByText("USD 2.469").first()).toBeVisible();
  await varios.getByRole("button", { name: "Agregar ítem" }).click();
  await expect(varios.getByText("«Cerco de obra» agregado.")).toBeVisible();

  await varios.getByLabel("Precio unitario (USD)").fill("800");
  await varios.getByLabel("Parte del costo").selectOption({ label: "Subcontratos" });
  await varios.getByLabel("Descripción").fill("Limpieza final");
  await varios.getByLabel("Cantidad").fill("1");
  await varios.getByLabel("Unidad").fill("gl");
  await varios.getByRole("button", { name: "Agregar ítem" }).click();
  await expect(varios.getByText("«Limpieza final» agregado.")).toBeVisible();

  // Resumen: total y partes.
  const summary = page.getByRole("region", { name: "Resumen del presupuesto" });
  await expect(summary.getByText("USD 3.269", { exact: true })).toBeVisible();
  await expect(summary.getByText("Materiales")).toBeVisible();
  await expect(summary.getByText("USD 2.469", { exact: true })).toBeVisible();
  await expect(summary.getByText("Subcontratos")).toBeVisible();
  await expect(summary.getByText("USD 800", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

// Un análisis en pesos dentro de un presupuesto en dólares: se pasa con el tipo de cambio.
test("un ítem con análisis de precios en pesos se pasa a dólares con el tipo de cambio", async ({ page }) => {
  const errors = trackPageErrors(page);
  const code = `PRE${Date.now().toString(36).toUpperCase()}`;
  await signInAs(page, "Ana");

  // Análisis: 10 kg de cemento (ARS 190) con 5 % de desperdicio = ARS 1.995 por m2.
  await page.goto("/analisis-de-precios");
  await openDisclosure(page, "Nuevo análisis de precio");
  await page.getByLabel("Código", { exact: true }).fill(code);
  await page.getByLabel("Nombre", { exact: true }).fill(`Carpeta ${code}`);
  await page.getByLabel("Rubro", { exact: true }).fill("Contrapisos y carpetas");
  await page.getByLabel("Unidad", { exact: true }).fill("m2");
  await page.getByRole("button", { name: "Crear y cargar componentes" }).click();
  await page.getByLabel("Buscar por código o nombre").fill("CEM-PORT");
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await page.getByRole("button", { name: "Agregar Cemento Portland" }).click();
  await page.getByLabel("Rendimiento de Cemento Portland").fill("10");
  await page.getByRole("button", { name: "Guardar componentes" }).click();
  await expect(page.getByText("Componentes guardados.")).toBeVisible();

  // Presupuesto en dólares (Edificio Alba) con tipo de cambio 1.000.
  await openProject(page, "Edificio Alba");
  await page.getByRole("link", { name: "Presupuestos", exact: true }).click();
  await page.getByLabel("Por ítem").check();
  await page.getByRole("button", { name: "Crear presupuesto" }).click();
  await expect(page.getByRole("heading", { level: 2, name: /Por ítem/ })).toBeVisible();
  await page.getByLabel("Pesos por dólar").fill("1000");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.getByText("Tipo de cambio guardado.")).toBeVisible();

  const rubro = page.getByRole("region", { name: "Contrapisos y carpetas" });
  await rubro.getByText("Agregar un ítem a Contrapisos y carpetas").click();
  await rubro.getByRole("combobox", { name: "Análisis de precios" }).selectOption({ label: `${code} · Carpeta ${code} (por m2)` });
  await rubro.getByLabel("Descripción").fill("Carpeta de planta baja");
  await rubro.getByLabel("Cantidad").fill("100");
  // 100 m2 × ARS 1.995 ÷ 1.000 = USD 199,50 (todo materiales).
  await expect(rubro.getByText("USD 199,50").first()).toBeVisible();
  await rubro.getByRole("button", { name: "Agregar ítem" }).click();
  await expect(rubro.getByText("«Carpeta de planta baja» agregado.")).toBeVisible();
  // En el resumen, el total y la parte de materiales dan lo mismo: es lo único que hay.
  await expect(page.getByRole("region", { name: "Resumen del presupuesto" }).getByText("USD 199,50", { exact: true })).toHaveCount(2);
  expect(errors).toEqual([]);
});
