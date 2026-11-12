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
