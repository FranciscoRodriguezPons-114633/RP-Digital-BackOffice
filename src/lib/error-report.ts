// Registro de errores del servidor en Sentry, sin el SDK: un evento por error al endpoint
// de envelopes de Sentry. Lo llama `onRequestError` (src/instrumentation.ts) y lo que
// necesite avisar de un problema que no rompe la página (por ejemplo, un límite de pedidos
// que no respondió). Sin SENTRY_DSN (local y CI) no hace nada.
//
// No manda encabezados, cookies, IP ni la query del pedido, y tapa el token de los links
// de aprobación: un error no puede filtrar datos personales ni un link que sirve.

export type Dsn = { endpoint: string; publicKey: string; raw: string };

export type ErrorContext = {
  path?: string;
  method?: string;
  routePath?: string;
  routeType?: string;
};

type Frame = { function?: string; filename: string; lineno?: number; colno?: number; in_app: boolean };

// https://<clave>@<host>/<prefijo opcional>/<proyecto>
export function parseDsn(dsn: string | undefined): Dsn | null {
  if (!dsn) return null;
  try {
    const url = new URL(dsn);
    const segments = url.pathname.split("/").filter(Boolean);
    const projectId = segments.pop();
    if (!url.username || !projectId || !/^\d+$/.test(projectId)) return null;
    const prefix = segments.length > 0 ? `/${segments.join("/")}` : "";
    return {
      endpoint: `${url.protocol}//${url.host}${prefix}/api/${projectId}/envelope/`,
      publicKey: url.username,
      raw: dsn,
    };
  } catch {
    return null;
  }
}

// El token de /aprobar/<token> da acceso a una orden: no puede quedar en el registro.
export function scrubPath(path: string | undefined): string | undefined {
  if (!path) return path;
  return path.split("?")[0].replace(/\/aprobar\/[^/]+/, "/aprobar/[token]");
}

// Pila de V8 («at fn (archivo:línea:columna)») a los cuadros que espera Sentry, del más
// viejo al más nuevo.
export function parseStack(stack: string | undefined): Frame[] {
  if (!stack) return [];
  const frames: Frame[] = [];
  for (const line of stack.split("\n")) {
    const m = line.match(/^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?\s*$/);
    if (!m) continue;
    const filename = m[2];
    frames.push({
      function: m[1],
      filename,
      lineno: Number(m[3]),
      colno: Number(m[4]),
      in_app: !filename.includes("node_modules") && !filename.startsWith("node:"),
    });
  }
  return frames.reverse();
}

export function buildEnvelope(dsn: Dsn, error: unknown, context: ErrorContext = {}, now = new Date()): string {
  const err = error instanceof Error ? error : new Error(String(error));
  const digest =
    typeof error === "object" && error !== null && "digest" in error ? String((error as { digest: unknown }).digest) : undefined;
  const eventId = crypto.randomUUID().replace(/-/g, "");
  const frames = parseStack(err.stack);
  const event = {
    event_id: eventId,
    timestamp: now.getTime() / 1000,
    platform: "node",
    level: "error",
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    transaction: context.routePath,
    tags: {
      ...(context.routeType ? { route_type: context.routeType } : {}),
      ...(digest ? { digest } : {}),
    },
    request: context.path ? { method: context.method, url: scrubPath(context.path) } : undefined,
    exception: {
      values: [
        {
          type: err.name,
          value: err.message,
          ...(frames.length > 0 ? { stacktrace: { frames } } : {}),
        },
      ],
    },
  };
  return [
    JSON.stringify({ event_id: eventId, sent_at: now.toISOString(), dsn: dsn.raw }),
    JSON.stringify({ type: "event" }),
    JSON.stringify(event),
  ].join("\n") + "\n";
}

// Nunca tira: si Sentry no responde en 2 segundos, el error se pierde, no la página.
export async function captureException(error: unknown, context: ErrorContext = {}): Promise<void> {
  const dsn = parseDsn(process.env.SENTRY_DSN);
  if (!dsn) return;
  try {
    await fetch(dsn.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-sentry-envelope",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${dsn.publicKey}, sentry_client=rp-backoffice/1.0`,
      },
      body: buildEnvelope(dsn, error, context),
      signal: AbortSignal.timeout(2000),
    });
  } catch {
    // Sin registro no hay a quién avisar; la app sigue.
  }
}
