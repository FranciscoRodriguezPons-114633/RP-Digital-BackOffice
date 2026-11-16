import { expect, type Page } from "@playwright/test";

// Ingreso con los botones de desarrollo (solo existen en `next dev` contra Supabase local).
export async function signInAs(page: Page, who: "Ana" | "Beto" | "Cliente invitado") {
  await page.goto("/login");
  await page.getByRole("button", { name: new RegExp(`^Entrar como ${who}`) }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

export async function openProject(page: Page, name: string) {
  await page.goto("/proyectos");
  await page.getByRole("link", { name }).first().click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
}

// Pasa a una pestaña del proyecto (Honorarios, Órdenes de cambio, Documentos…). El nombre
// del link puede llevar un número al final («Órdenes de cambio 1 esperando respuesta»).
export async function openProjectSection(page: Page, label: string) {
  const link = page
    .getByRole("navigation", { name: "Secciones del proyecto" })
    .getByRole("link", { name: new RegExp(`^${label}`) });
  await link.click();
  await expect(link).toHaveAttribute("aria-current", "page");
}

// Abre el panel de un botón («Nuevo insumo», «Nuevo análisis de precio») y lo devuelve.
export async function openPanel(page: Page, button: string) {
  await page.getByRole("button", { name: button, exact: true }).click();
  const panel = page.getByRole("dialog");
  await expect(panel).toBeVisible();
  return panel;
}

// Errores que la página tira sin que nadie los ataje (por ejemplo, un componente que falla al
// renderizarse en el servidor y cae al navegador: se ve bien, pero está roto). Cada prueba
// termina con `expect(errors).toEqual([])`.
export function trackPageErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message.split("\n")[0]));
  return errors;
}
