import Link from "next/link";
import type { Metadata } from "next";
import { FOUNDER_OFFER, PLANS, TRIAL_DAYS, YEARLY_OFFER } from "@/lib/plans";

// Página de producto. Quien tiene sesión no la ve: el proxy lo manda a sus proyectos.
export const metadata: Metadata = {
  title: { absolute: "RP Backoffice · Lo que cobra y lo que está vigente, en un solo lugar" },
  description:
    "Para estudios de arquitectura: honorarios por etapa, cambios que el cliente aprueba por link y planos vigentes que avisan qué quedó desactualizado.",
};

const PROBLEMS = [
  {
    title: "Cambios que nunca se cobran",
    body: "El cliente pide «un cambiecito» por WhatsApp y se hace gratis. Acá se arma la orden de cambio con horas y monto, y el cliente la aprueba desde el teléfono, sin crear cuenta.",
  },
  {
    title: "Honorarios que nadie sabe si alcanzan",
    body: "Etapas con monto fijo, por hora o mixto, ajustadas por índice, y las horas del equipo contra lo previsto. Te avisamos al 80% y al 100%.",
  },
  {
    title: "Renders y planos de venta viejos",
    body: "Al publicar una revisión nueva, todo lo que dependía de la anterior queda «a revisar» y su responsable recibe un aviso. Y sabés qué versión le mandaste a quién.",
  },
];

const STEPS = [
  "Cargás el proyecto con sus etapas de honorarios, o copiás uno anterior.",
  "Subís los planos de una vez: el nombre del archivo dice a qué documento va.",
  "Invitás al cliente, al renderista y al contratista. Entran gratis y ven solo lo suyo.",
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
          <span className="font-semibold tracking-tight">RP Backoffice</span>
          <Link href="/login" className="btn btn-ghost ml-auto">Ingresar</Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-16 px-4 py-12 sm:py-20">
        <section className="flex max-w-3xl flex-col gap-5">
          <p className="text-sm font-medium text-accent">Para estudios de arquitectura</p>
          <h1 className="text-3xl leading-tight font-semibold sm:text-5xl">
            Lo que el estudio cobra y lo que está vigente, en un solo lugar.
          </h1>
          <p className="max-w-2xl text-lg text-muted">
            Honorarios por etapa, cambios que el cliente aprueba por link y planos que avisan qué quedó desactualizado.
            Sin planillas sueltas ni «¿quién aprobó esto?».
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/login" className="btn btn-primary btn-lg">
              Probar {TRIAL_DAYS} días gratis
            </Link>
            <span className="text-sm text-muted">Sin tarjeta. Tus invitados entran gratis.</span>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-3">
          {PROBLEMS.map((p) => (
            <article key={p.title} className="card flex flex-col gap-2">
              <h2 className="font-medium">{p.title}</h2>
              <p className="text-sm text-muted">{p.body}</p>
            </article>
          ))}
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold">Un proyecto real cargado en media hora</h2>
          <ol className="grid gap-4 sm:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s} className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-surface">
                  {i + 1}
                </span>
                <span className="text-sm">{s}</span>
              </li>
            ))}
          </ol>
        </section>

        <section id="precios" className="flex flex-col gap-4">
          <div>
            <h2 className="text-xl font-semibold">Precios</h2>
            <p className="mt-1 text-sm text-muted">Por estudio, no por usuario. Clientes, renderistas y contratistas, gratis.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {(Object.keys(PLANS) as (keyof typeof PLANS)[]).map((k) => (
              <article key={k} className="card flex flex-col gap-2">
                <h3 className="font-medium">{PLANS[k].name}</h3>
                <p>
                  <span className="font-mono text-3xl font-semibold">USD {PLANS[k].usd}</span>
                  <span className="text-sm text-muted"> por mes</span>
                </p>
                <p className="text-sm text-muted">{PLANS[k].detail}.</p>
              </article>
            ))}
          </div>
          <p className="text-sm text-muted">
            {TRIAL_DAYS} días de prueba. {FOUNDER_OFFER} {YEARLY_OFFER} Facturamos en pesos, al tipo de cambio del día.
          </p>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-5xl flex-wrap gap-4 px-4 py-6 text-sm text-muted">
          <span>RP Backoffice · Córdoba, Argentina</span>
          <Link href="/terminos" className="hover:underline">Términos</Link>
          <Link href="/privacidad" className="hover:underline">Privacidad</Link>
        </div>
      </footer>
    </div>
  );
}
