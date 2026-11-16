import { expect, test } from "@playwright/test";
import { openProject, openProjectSection, signInAs, trackPageErrors } from "./helpers";

// Todas las pantallas del estudio, de Finanzas de obra y de la plataforma (Ana es dueña del
// estudio de ejemplo y administra la plataforma en el seed). Cada una tiene que cargar con su
// título y sin errores en el navegador.
const SCREENS: [string, string][] = [
  ["/proyectos", "Proyectos"],
  ["/a-revisar", "A revisar"],
  ["/vencimientos", "Vencimientos"],
  ["/horas", "Cargar horas"],
  ["/recuperado", "Lo recuperado"],
  ["/indices", "Índices"],
  ["/equipo", "Equipo"],
  ["/plan", "Plan"],
  ["/obras", "Obras"],
  ["/analisis-de-precios", "Análisis de precios"],
  ["/insumos", "Insumos"],
  ["/insumos/importar", "Importar insumos desde Excel"],
  ["/terceros", "Terceros"],
  ["/admin/cobros", "Cobros"],
  ["/admin/series", "Series de referencia"],
  ["/sistema", "Sistema de diseño"],
];

test("todas las pantallas cargan sin errores", async ({ page }) => {
  const errors = trackPageErrors(page);
  await signInAs(page, "Ana");

  for (const [path, title] of SCREENS) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: title }), path).toBeVisible();
  }

  // Un insumo del seed, por dentro.
  await page.goto("/insumos");
  await page.getByRole("link", { name: /Cemento Portland/ }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "Cemento Portland" })).toBeVisible();

  // El proyecto y cada una de sus pestañas.
  await openProject(page, "Edificio Alba");
  for (const label of ["Honorarios", "Órdenes de cambio", "Documentos", "Obra", "Presupuestos", "Invitados", "Actividad"]) {
    await openProjectSection(page, label);
  }

  expect(errors).toEqual([]);
});
