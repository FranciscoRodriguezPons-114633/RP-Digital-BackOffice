import type { Instrumentation } from "next";

// Cada error del servidor (páginas, acciones, rutas y proxy) va a Sentry si SENTRY_DSN está
// cargado. El módulo se importa solo cuando hace falta.
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (!process.env.SENTRY_DSN) return;
  const { captureException } = await import("./lib/error-report");
  await captureException(error, {
    path: request.path,
    method: request.method,
    routePath: context.routePath,
    routeType: context.routeType,
  });
};
