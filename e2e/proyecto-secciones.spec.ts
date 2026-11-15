import { expect, test } from "@playwright/test";
import { openProject, openProjectSection, signInAs, trackPageErrors } from "./helpers";

test("el proyecto se recorre por pestañas y el resumen muestra lo pendiente", async ({ page }) => {
  const errors = trackPageErrors(page);
  await signInAs(page, "Ana");
  await openProject(page, "Edificio Alba");

  const sections = page.getByRole("navigation", { name: "Secciones del proyecto" });
  await expect(sections.getByRole("link", { name: "Resumen" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { name: "Para atender" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Horas por etapa" })).toBeVisible();
  await expect(page.getByText("Resultado · solo vos")).toBeVisible();

  await openProjectSection(page, "Honorarios");
  await expect(page.getByRole("heading", { name: "Honorarios por etapa" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Rentabilidad" })).toBeVisible();

  await openProjectSection(page, "Documentos");
  await expect(page.getByRole("heading", { name: "Planos y documentos" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Piezas dependientes" })).toBeVisible();

  await openProjectSection(page, "Invitados");
  await expect(page.getByText("cliente@estudio.test")).toBeVisible();

  await openProjectSection(page, "Actividad");
  await expect(page.getByRole("heading", { level: 2, name: "Actividad" })).toBeVisible();

  // El encabezado es el mismo en todas las pestañas.
  await expect(page.getByRole("heading", { level: 1, name: "Edificio Alba" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("un invitado que llega a una sección del estudio vuelve a la portada del proyecto", async ({ page }) => {
  await signInAs(page, "Cliente invitado");
  await openProject(page, "Edificio Alba");
  await expect(page.getByRole("heading", { name: "Tu acceso" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Secciones del proyecto" })).toHaveCount(0);

  const home = new URL(page.url()).pathname;
  await page.goto(`${home}/honorarios`);
  await expect(page).toHaveURL(new RegExp(`${home}$`));
  await expect(page.getByRole("heading", { name: "Tu acceso" })).toBeVisible();
});
