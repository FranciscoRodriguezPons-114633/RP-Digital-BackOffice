import { expect, test } from "@playwright/test";
import { openPanel, openProject, openProjectSection, signInAs, trackPageErrors } from "./helpers";

// Sprint 7: del costo directo al precio sin IVA, con los mismos porcentajes que la prueba pgTAP
// 22_presupuesto_resumen. Edificio Alba presupuesta en dólares.
test("el presupuesto suma personal, pase y honorarios hasta el precio sin IVA", async ({ page }) => {
  const errors = trackPageErrors(page);
  await signInAs(page, "Ana");
  await openProject(page, "Edificio Alba");
  await openProjectSection(page, "Presupuestos");
  await page.getByLabel("Por ítem").check();
  await page.getByRole("button", { name: "Crear presupuesto" }).click();
  await expect(page.getByRole("heading", { level: 2, name: /Por ítem/ })).toBeVisible();

  // Costo directo: USD 10.000 de materiales.
  const varios = page.getByRole("region", { name: "Varios" });
  await varios.getByText("Agregar un ítem a Varios").click();
  await varios.getByLabel("Precio directo").check();
  await varios.getByLabel("Precio unitario (USD)").fill("10000");
  await varios.getByLabel("Descripción").fill("Materiales varios");
  await varios.getByLabel("Cantidad").fill("1");
  await varios.getByLabel("Unidad").fill("gl");
  await varios.getByRole("button", { name: "Agregar ítem" }).click();
  await expect(varios.getByText("«Materiales varios» agregado.")).toBeVisible();

  await page.getByRole("link", { name: "Indirectos, honorarios y pase" }).click();

  // Personal: capataz, 2 meses × USD 1.500. Costo: 10.000 + 3.000 = 13.000.
  const panel = await openPanel(page, "Agregar");
  await panel.getByLabel("Concepto").fill("Capataz");
  await panel.getByLabel("Meses").fill("2");
  await panel.getByLabel("Costo por mes (USD)").fill("1500");
  await expect(panel.getByText("USD 3.000")).toBeVisible();
  await panel.getByRole("button", { name: "Agregar" }).click();
  await expect(page.getByText("«Capataz» agregado.")).toBeVisible();
  const summary = page.getByRole("region", { name: "Resumen del presupuesto" });
  await expect(summary.getByRole("row", { name: /^Costo USD/ })).toContainText("USD 13.000");

  // Pase en cascada: GG 1.300 · B 14.300 × 15 % = 2.145 · I 16.445 × 5 % = 822,25.
  const pase = page.getByRole("region", { name: "Pase" });
  await pase.getByRole("textbox", { name: /^Gastos generales/ }).fill("10");
  await pase.getByRole("textbox", { name: /^Beneficio/ }).fill("15");
  await pase.getByRole("textbox", { name: /^Impuestos/ }).fill("5");
  await expect(pase.getByText("USD 4.267,25")).toBeVisible();
  await pase.getByRole("button", { name: "Guardar el pase" }).click();
  await expect(pase.getByText("Pase guardado.")).toBeVisible();
  await expect(summary.getByRole("row", { name: /^Pase/ })).toContainText("USD 4.267,25");

  // Honorarios por horas: 100 h × USD 50, después del pase.
  const honorarios = page.getByRole("region", { name: "Honorarios de arquitectos" });
  await honorarios.getByLabel("Por horas estimadas").check();
  await honorarios.getByRole("textbox", { name: "Horas estimadas" }).fill("100");
  await honorarios.getByLabel("Costo por hora (USD)").fill("50");
  await honorarios.getByRole("button", { name: "Guardar" }).click();
  await expect(honorarios.getByText("Honorarios guardados.")).toBeVisible();
  await expect(summary.getByRole("row", { name: /^Honorarios/ })).toContainText("USD 5.000");
  await expect(summary.getByRole("row", { name: /^Precio sin IVA/ })).toContainText("USD 22.267,25");
  expect(errors).toEqual([]);
});
