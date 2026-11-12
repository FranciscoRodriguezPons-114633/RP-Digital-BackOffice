import { expect, test } from "@playwright/test";
import { openProject, signInAs } from "./helpers";

// Link fijo de la OC-001 que deja el seed (ver supabase/seed.sql).
const OC_001_LINK = "/aprobar/link-de-prueba-local-para-aprobar-la-oc-001";

test("el cliente aprueba la OC-001 desde el link, sin cuenta", async ({ page }) => {
  await page.goto(OC_001_LINK);
  await expect(page.getByRole("heading", { name: "Carpinterías de PVC en fachada norte" })).toBeVisible();

  await page.getByLabel("Tu nombre y apellido").fill("Laura Gómez");
  await page.getByLabel("Comentario (opcional)").fill("Avancen con el PVC.");
  await page.getByRole("button", { name: "Aprobar" }).click();

  await expect(page.getByText("Aprobaste OC-001")).toBeVisible();
  await expect(page.getByText(/Lo hizo Laura Gómez/)).toBeVisible();
});

test("un link de una orden editada después del envío avisa que la orden cambió", async ({ page, browser }) => {
  await signInAs(page, "Ana");
  await openProject(page, "Edificio Alba");

  await page.getByText("Enviar o editar OC-003").click();
  const order = page.locator("details", { hasText: "Enviar o editar OC-003" });
  await order.getByLabel("Enviar al cliente").fill("cliente@estudio.test");
  await order.getByRole("button", { name: "Enviar para aprobar" }).click();
  const link = await order.locator("code").filter({ hasText: "/aprobar/" }).textContent();
  expect(link).toBeTruthy();

  // Se edita la orden ya enviada: el link que tiene el cliente deja de valer.
  await order.getByLabel("Monto").fill("900");
  await order.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(order.getByText("Cambios guardados.")).toBeVisible();

  // El cliente abre el link sin sesión.
  const client = await browser.newContext();
  const clientPage = await client.newPage();
  await clientPage.goto(new URL(link!.trim()).pathname);
  await expect(clientPage.getByText("Estudio Demo cambió OC-003")).toBeVisible();
  await expect(clientPage.getByRole("button", { name: "Aprobar" })).toHaveCount(0);
  await client.close();
});
