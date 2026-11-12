import { defineConfig, devices } from "@playwright/test";

// Pruebas punta a punta contra la app en `next dev` y un Supabase local recién reseteado
// (`npx supabase db reset`): usan los usuarios y los datos de supabase/seed.sql, y los
// botones de ingreso de desarrollo. Cambian datos (aprueban la OC-001, completan la ficha de
// Casa Norte), así que para volver a correrlas hay que resetear la base.
const PORT = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "es-AR",
    timezoneId: "America/Argentina/Cordoba",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx next dev --port ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: { APP_URL: `http://localhost:${PORT}` },
  },
});
