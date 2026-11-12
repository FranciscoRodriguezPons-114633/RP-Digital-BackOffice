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

// Abre un desplegable de alta («Nuevo insumo», «Nuevo análisis de precio») si está cerrado:
// arranca abierto solo cuando la lista está vacía. Espera a que la página termine de cargar
// antes de mirar, para no cerrarlo por error.
export async function openDisclosure(page: Page, summary: string) {
  const toggle = page.locator("summary", { hasText: summary });
  await expect(toggle).toBeVisible();
  const details = page.locator("details", { has: toggle });
  if ((await details.getAttribute("open")) === null) await toggle.click();
}

// Errores que la página tira sin que nadie los ataje (por ejemplo, un componente que falla al
// renderizarse en el servidor y cae al navegador: se ve bien, pero está roto). Cada prueba
// termina con `expect(errors).toEqual([])`.
export function trackPageErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message.split("\n")[0]));
  return errors;
}
