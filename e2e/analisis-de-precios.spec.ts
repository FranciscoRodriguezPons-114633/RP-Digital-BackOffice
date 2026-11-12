import { expect, test } from "@playwright/test";
import { openDisclosure, signInAs, trackPageErrors } from "./helpers";

// Del insumo al análisis de precio: usa el cemento del seed (CEM-PORT, ARS 190 por kg).
test("se arma un análisis de precio con un insumo y el costo se calcula en vivo", async ({ page }) => {
  const code = `APU${Date.now().toString(36).toUpperCase()}`;
  const errors = trackPageErrors(page);
  await signInAs(page, "Ana");
  await page.goto("/analisis-de-precios");

  await openDisclosure(page, "Nuevo análisis de precio");
  await page.getByLabel("Código", { exact: true }).fill(code);
  await page.getByLabel("Nombre", { exact: true }).fill("Carpeta de cemento de 2 cm");
  await page.getByLabel("Rubro", { exact: true }).fill("Contrapisos y carpetas");
  await page.getByLabel("Unidad", { exact: true }).fill("m2");
  await page.getByRole("button", { name: "Crear y cargar componentes" }).click();

  // Queda en el editor del análisis nuevo.
  await expect(page.getByRole("heading", { level: 1, name: "Carpeta de cemento de 2 cm" })).toBeVisible();
  await page.getByLabel("Buscar por código o nombre").fill("CEM-PORT");
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await page.getByRole("button", { name: "Agregar Cemento Portland" }).click();

  // 4,2 kg × (1 + 5 % de desperdicio) × ARS 190 = ARS 837,90, antes de guardar.
  await page.getByLabel("Rendimiento de Cemento Portland").fill("4,2");
  await expect(page.getByText("ARS 837,90").first()).toBeVisible();
  await expect(page.getByText("Hay cambios sin guardar.")).toBeVisible();

  await page.getByRole("button", { name: "Guardar componentes" }).click();
  await expect(page.getByText("Componentes guardados.")).toBeVisible();

  // La lista muestra el costo por unidad que calcula la base: el mismo.
  await page.goto("/analisis-de-precios");
  const row = page.getByRole("link", { name: new RegExp(code) });
  await expect(row).toContainText("ARS 837,90");
  await expect(row).toContainText("/ m2");
  expect(errors).toEqual([]);
});
