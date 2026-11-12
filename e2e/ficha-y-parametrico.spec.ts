import { expect, test } from "@playwright/test";
import { openProject, signInAs } from "./helpers";

test("se completa la ficha de obra y se crea la estimación paramétrica", async ({ page }) => {
  await signInAs(page, "Ana");
  await openProject(page, "Casa Norte");

  await page.getByRole("link", { name: "Obra", exact: true }).click();
  await page.getByLabel("Construimos la obra").check();
  await page.getByLabel("m² cubiertos").fill("180");
  await page.getByLabel("Tipología").selectOption({ label: "Vivienda unifamiliar" });
  await page.getByRole("button", { name: "Guardar ficha" }).click();
  await expect(page.getByRole("link", { name: "Estimar costo" })).toBeVisible();

  await page.getByRole("link", { name: "Estimar costo" }).click();
  await page.getByLabel(/Costo de referencia por m²/).fill("1.503");
  await page.getByLabel("De dónde sale").fill("Costo propio de la última obra");
  // 180 m² × USD 1.503 × 1 (unifamiliar) × 1 (estándar)
  await expect(page.getByText("USD 270.540").first()).toBeVisible();

  await page.getByRole("button", { name: "Guardar estimación" }).click();
  await expect(page.getByText(/Listo: versión 1/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Versiones" })).toBeVisible();
});
