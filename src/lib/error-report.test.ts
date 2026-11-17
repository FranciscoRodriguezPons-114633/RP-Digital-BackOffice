import { afterEach, describe, expect, it, vi } from "vitest";
import { buildEnvelope, captureException, parseDsn, parseStack, scrubPath } from "./error-report";

const DSN = "https://abc123@o42.ingest.us.sentry.io/4507";

describe("parseDsn", () => {
  it("arma el endpoint de envelopes con la clave pública", () => {
    expect(parseDsn(DSN)).toEqual({
      endpoint: "https://o42.ingest.us.sentry.io/api/4507/envelope/",
      publicKey: "abc123",
      raw: DSN,
    });
  });
  it("respeta un prefijo de ruta", () => {
    expect(parseDsn("https://k@sentry.example.com/base/12")?.endpoint).toBe("https://sentry.example.com/base/api/12/envelope/");
  });
  it("sin DSN o con uno mal formado no hay registro", () => {
    expect(parseDsn(undefined)).toBeNull();
    expect(parseDsn("no es una url")).toBeNull();
    expect(parseDsn("https://o42.ingest.sentry.io/4507")).toBeNull();
    expect(parseDsn("https://k@o42.ingest.sentry.io/proyecto")).toBeNull();
  });
});

describe("scrubPath", () => {
  it("tapa el token de los links de aprobación y saca la query", () => {
    expect(scrubPath("/aprobar/abcDEF123_-xyz?x=1")).toBe("/aprobar/[token]");
    expect(scrubPath("/proyectos/1/ordenes?etapa=2")).toBe("/proyectos/1/ordenes");
  });
});

describe("parseStack", () => {
  it("convierte la pila de V8 en cuadros, del más viejo al más nuevo", () => {
    const stack = [
      "Error: falló",
      "    at loadBudget (/var/task/.next/server/app/page.js:10:5)",
      "    at async Page (/var/task/node_modules/next/dist/server.js:3:9)",
      "    at node:internal/process/task_queues:95:5",
    ].join("\n");
    const frames = parseStack(stack);
    expect(frames).toHaveLength(3);
    expect(frames.at(-1)).toMatchObject({ function: "loadBudget", lineno: 10, colno: 5, in_app: true });
    expect(frames.at(1)).toMatchObject({ function: "async Page", in_app: false });
    expect(frames.at(0)).toMatchObject({ filename: "node:internal/process/task_queues", in_app: false });
  });
});

describe("buildEnvelope", () => {
  it("manda el error con su ruta, sin el token ni datos del pedido", () => {
    const dsn = parseDsn(DSN)!;
    const err = Object.assign(new Error("se rompió"), { digest: "123456" });
    const lines = buildEnvelope(dsn, err, { path: "/aprobar/secreto?a=b", method: "POST", routePath: "/aprobar/[token]", routeType: "action" }, new Date("2026-11-23T12:00:00Z"))
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatchObject({ sent_at: "2026-11-23T12:00:00.000Z", dsn: DSN });
    expect(lines[1]).toEqual({ type: "event" });
    const event = lines[2];
    expect(event.event_id).toMatch(/^[0-9a-f]{32}$/);
    expect(event.exception.values[0]).toMatchObject({ type: "Error", value: "se rompió" });
    expect(event.request).toEqual({ method: "POST", url: "/aprobar/[token]" });
    expect(event.tags).toEqual({ route_type: "action", digest: "123456" });
    expect(JSON.stringify(event)).not.toContain("secreto");
  });
  it("acepta algo que no es un Error", () => {
    const event = JSON.parse(buildEnvelope(parseDsn(DSN)!, "texto").trim().split("\n")[2]);
    expect(event.exception.values[0].value).toBe("texto");
  });
});

describe("captureException", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  it("sin SENTRY_DSN no manda nada", async () => {
    vi.stubEnv("SENTRY_DSN", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await captureException(new Error("x"));
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("con SENTRY_DSN manda el envelope con la clave en el encabezado", async () => {
    vi.stubEnv("SENTRY_DSN", DSN);
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await captureException(new Error("x"));
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://o42.ingest.us.sentry.io/api/4507/envelope/");
    expect(init.headers["X-Sentry-Auth"]).toContain("sentry_key=abc123");
  });
  it("si Sentry no responde, no tira", async () => {
    vi.stubEnv("SENTRY_DSN", DSN);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("sin red")));
    await expect(captureException(new Error("x"))).resolves.toBeUndefined();
  });
});
