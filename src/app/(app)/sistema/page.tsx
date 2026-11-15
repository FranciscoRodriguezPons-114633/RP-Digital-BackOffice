import type { Metadata } from "next";
import { Inbox, Plus } from "lucide-react";
import { StatusPill } from "@/components/status-pill";
import { AttentionItem } from "@/components/ui/attention";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PillNav } from "@/components/ui/pill-nav";
import { ProgressBar } from "@/components/ui/progress-bar";
import { StatCard } from "@/components/ui/stat-card";
import { ThemeSwitcher } from "@/components/ui/theme-switcher";
import { OverlayDemos } from "./demos";

export const metadata: Metadata = { title: "Sistema de diseño" };

// Página interna: todos los componentes de la interfaz «Tablero de obra» en un solo lugar,
// para revisarlos en claro, oscuro y en el teléfono antes de usarlos en una pantalla.
const COLORS = [
  ["Fondo", "bg-background"],
  ["Superficie", "bg-surface"],
  ["Hundido", "bg-sunken"],
  ["Texto", "bg-foreground"],
  ["Secundario", "bg-muted"],
  ["Línea", "bg-line-strong"],
  ["Acento", "bg-accent"],
  ["Navegación", "bg-nav"],
  ["Bien", "bg-ok"],
  ["Atención", "bg-warn"],
  ["Peligro", "bg-danger"],
  ["Información", "bg-info"],
] as const;

export default function DesignSystemPage() {
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        back={{ href: "/proyectos", label: "Proyectos" }}
        title="Sistema de diseño"
        status={<StatusPill tone="accent">Tablero de obra</StatusPill>}
        meta="Colores, tipografía y componentes de la interfaz. Cambiá el tema para ver los dos."
        actions={
          <button type="button" className="btn btn-primary">
            <Plus aria-hidden="true" size={16} />
            Acción principal
          </button>
        }
      />

      <Section title="Tema">
        <div className="w-full max-w-sm rounded-[var(--radius-card)] bg-nav p-3">
          <ThemeSwitcher />
        </div>
      </Section>

      <Section title="Colores">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {COLORS.map(([label, cls]) => (
            <div key={label} className="flex flex-col gap-2">
              <span className={`h-14 rounded-[var(--radius-control)] border border-line ${cls}`} />
              <span className="text-xs font-semibold">{label}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Tipografía">
        <div className="card flex flex-col gap-3">
          <p className="text-3xl font-extrabold tracking-tight">Edificio Alba</p>
          <p className="text-lg font-bold">Honorarios por etapa</p>
          <p className="text-sm">Texto de lectura: Inter 14 px. Las cifras usan números tabulares para alinearse en columnas.</p>
          <p className="stat">USD 347.687,13</p>
          <p className="text-sm text-muted">Texto secundario en gris pizarra.</p>
        </div>
      </Section>

      <Section title="Botones y campos">
        <div className="card flex flex-col gap-5">
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary">Guardar</button>
            <button type="button" className="btn btn-secondary">Cancelar</button>
            <button type="button" className="btn btn-ghost">Más tarde</button>
            <button type="button" className="btn btn-danger">Anular</button>
            <button type="button" className="btn btn-primary" disabled>Guardando…</button>
            <button type="button" className="btn btn-secondary btn-sm">Chico</button>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="field">
              Nombre
              <input className="input" placeholder="Edificio Alba" />
            </label>
            <label className="field">
              Moneda
              <select className="input" defaultValue="USD">
                <option>USD</option>
                <option>ARS</option>
              </select>
            </label>
            <label className="field">
              Monto
              <input className="input tabular" inputMode="decimal" placeholder="1.800" />
            </label>
          </div>
        </div>
      </Section>

      <Section title="Estados">
        <div className="flex flex-wrap gap-2">
          <StatusPill>Borrador</StatusPill>
          <StatusPill tone="accent">Vigente</StatusPill>
          <StatusPill tone="ok">Aprobada</StatusPill>
          <StatusPill tone="warn">Esperando</StatusPill>
          <StatusPill tone="danger">Rechazada</StatusPill>
          <StatusPill tone="info">Programada</StatusPill>
          <StatusPill struck>Reemplazada</StatusPill>
          <span className="badge">Constructora</span>
        </div>
      </Section>

      <Section title="Tarjetas de resumen">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Honorarios" value="USD 55.200" hint="Con índice y adicionales" />
          <StatCard label="Horas usadas" value="6%" hint="72,5 de 1.170 h">
            <ProgressBar pct={6} tone="neutral" />
          </StatCard>
          <StatCard label="Adicionales" value="USD 2.400" hint="+ USD 750 esperando" tone="warn" />
          <StatCard label="Resultado · solo vos" value={<span className="text-[#4ade80]">USD 53.388</span>} hint="97% del honorario" dark />
        </div>
      </Section>

      <Section title="Avance">
        <div className="card flex flex-col gap-4">
          {[
            ["Anteproyecto", 28],
            ["Croquis preliminar", 73],
            ["Documentación", 86],
            ["Dirección de obra", 104],
          ].map(([label, pct]) => (
            <div key={label} className="flex flex-col gap-1.5">
              <div className="flex text-sm">
                <span className="font-semibold">{label}</span>
                <span className="ml-auto text-muted tabular">{pct}%</span>
              </div>
              <ProgressBar pct={Number(pct)} size="lg" />
            </div>
          ))}
        </div>
      </Section>

      <Section title="Para atender">
        <div className="card flex flex-col gap-3">
          <AttentionItem tone="warn" title="OC-003 esperando al cliente" detail="Cambio de solado · USD 750 · vence 26 nov" href="#" />
          <AttentionItem tone="danger" title="Presentación municipal" detail="Vence el 24 nov · en 9 días" href="#" />
          <AttentionItem tone="info" title="2 piezas a revisar" detail="Salió A-301 rev. C" href="#" />
          <AttentionItem tone="neutral" title="Falta el costo por hora de Beto" detail="Sus horas no restan en el resultado" />
        </div>
      </Section>

      <Section title="Pestañas">
        <PillNav
          label="Secciones de ejemplo"
          items={[
            { href: "/sistema", label: "Resumen", current: true },
            { href: "#honorarios", label: "Honorarios" },
            { href: "#ordenes", label: "Órdenes de cambio", count: 3 },
            { href: "#documentos", label: "Documentos" },
          ]}
        />
      </Section>

      <Section title="Paneles, diálogos y avisos">
        <OverlayDemos />
      </Section>

      <Section title="Lista vacía">
        <EmptyState
          icon={Inbox}
          title="Todavía no hay órdenes de cambio"
          action={<button type="button" className="btn btn-primary">Crear la primera</button>}
        >
          Cuando el cliente pide algo fuera del alcance, armás la orden con horas y monto y se la mandás por link.
        </EmptyState>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-bold">{title}</h2>
      {children}
    </section>
  );
}
