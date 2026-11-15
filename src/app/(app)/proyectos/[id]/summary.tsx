import Link from "next/link";
import { CircleCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatDay, formatHours, formatMoney, formatPeriod, sumAmounts, todayInCordoba } from "@/lib/format";
import { changeOrderCode } from "@/lib/validation";
import { StatCard } from "@/components/ui/stat-card";
import { ProgressBar, progressTone } from "@/components/ui/progress-bar";
import { AttentionItem, type AttentionTone } from "@/components/ui/attention";
import { Disclosure } from "@/components/disclosure";
import { DeadlineForm } from "../../deadline-forms";
import { DEADLINE_SELECT, DeadlineList, daysUntil, whenLabel, type DeadlineRow } from "../../vencimientos/deadline-list";
import { eventText, type EventRow } from "./event-text";

type StageRow = {
  id: string;
  name: string;
  currency: string;
  budget_hours: string | null;
  hours_used: string;
  budget_pct: string | null;
  total_amount: string | null;
  extras_approved: string;
  extras_pending: string;
  index_missing: boolean;
  index_name: string | null;
  index_base_period: string | null;
};
type WaitingOrder = { id: string; number: number; title: string; amount: string; currency: string };
type ProfitRow = { currency: string; income: string; profit: string };
type Missing = { user_id: string; hours: string };
type Member = { user_id: string; email: string };

const dateFmt = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Argentina/Cordoba",
});

// Un Server Component se renderiza una vez por pedido: la hora es estable dentro del render.
function requestTime() {
  return new Date();
}

// Suma por moneda, en el orden en que aparecen las monedas.
function byCurrency<T extends { currency: string }>(rows: T[], amount: (r: T) => string | null) {
  const map = new Map<string, (string | null)[]>();
  for (const r of rows) map.set(r.currency, [...(map.get(r.currency) ?? []), amount(r)]);
  return [...map.entries()].map(([currency, values]) => ({ currency, total: sumAmounts(values) }));
}

// Sin centavos en las tarjetas de arriba: el importe exacto está en cada sección.
const roundMoney = (amount: number | string, currency: string) => formatMoney(Math.round(Number(amount)), currency);

// El primer importe va grande; si hay otra moneda, se nombra abajo (no se convierten monedas).
function splitMoney(list: { currency: string; total: number }[]) {
  const shown = list.filter((m) => m.total !== 0);
  return {
    main: shown[0] ? roundMoney(shown[0].total, shown[0].currency) : "—",
    rest: shown.slice(1).map((m) => roundMoney(m.total, m.currency)).join(" y "),
  };
}

const pctLabel = (pct: number) => `${String(pct).replace(".", ",")} %`;

// Portada del proyecto para el estudio: los números que importan, lo que pide una acción,
// las horas por etapa, los vencimientos y lo último que pasó.
export async function ProjectSummary({
  projectId,
  orgId,
  isOwner,
  works,
}: {
  projectId: string;
  orgId: string;
  isOwner: boolean;
  works: boolean;
}) {
  const showResult = isOwner && works;
  const supabase = await createClient();
  const [stageRes, waitingRes, deadlineRes, toReviewRes, profitRes, missingRes, eventRes] = await Promise.all([
    supabase
      .from("fee_stage_summary")
      .select(
        "id, name, currency, budget_hours, hours_used, budget_pct, total_amount, extras_approved, extras_pending, " +
          "index_missing, index_name, index_base_period",
      )
      .eq("project_id", projectId)
      .order("position")
      .order("created_at"),
    supabase
      .from("change_orders")
      .select("id, number, title, amount, currency")
      .eq("project_id", projectId)
      .eq("status", "sent")
      .order("number"),
    supabase.from("deadlines").select(DEADLINE_SELECT).eq("project_id", projectId).is("done_at", null).order("due_date"),
    supabase
      .from("dependencies")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .eq("status", "to_review"),
    showResult
      ? supabase.from("project_profitability").select("currency, income, profit").eq("project_id", projectId).order("currency")
      : Promise.resolve({ data: [] }),
    showResult
      ? supabase.from("missing_member_costs").select("user_id, hours").eq("project_id", projectId)
      : Promise.resolve({ data: [] }),
    supabase
      .from("events")
      .select("id, type, actor_email, data, created_at")
      .or(`entity_id.eq.${projectId},data->>project_id.eq.${projectId}`)
      .order("created_at", { ascending: false })
      .limit(6),
  ]);
  const stages = (stageRes.data ?? []) as unknown as StageRow[];
  const waiting = (waitingRes.data ?? []) as WaitingOrder[];
  const deadlines = (deadlineRes.data ?? []) as unknown as DeadlineRow[];
  const toReview = toReviewRes.count ?? 0;
  const profit = (profitRes.data ?? []) as ProfitRow[];
  const missing = (missingRes.data ?? []) as Missing[];
  const events = (eventRes.data ?? []) as EventRow[];
  // Los correos hacen falta solo para nombrar a quien no tiene costo cargado.
  const { data: memberData } = missing.length > 0 ? await supabase.rpc("list_org_members", { p_org_id: orgId }) : { data: [] };
  const emails = new Map(((memberData ?? []) as Member[]).map((m) => [m.user_id, m.email]));

  const now = requestTime();
  const today = todayInCordoba(now);
  const base = `/proyectos/${projectId}`;

  // Números de arriba.
  const fees = splitMoney(byCurrency(stages, (s) => s.total_amount));
  const extras = splitMoney(byCurrency(stages, (s) => s.extras_approved));
  const pending = splitMoney(byCurrency(stages, (s) => s.extras_pending));
  const used = sumAmounts(stages.map((s) => s.hours_used));
  const budget = sumAmounts(stages.map((s) => s.budget_hours));
  const hoursPct = budget > 0 ? Math.round((1000 * used) / budget) / 10 : null;
  const hoursTone = progressTone(hoursPct);
  const result = profit.find((p) => Number(p.income) !== 0 || Number(p.profit) !== 0) ?? profit[0];
  const next = deadlines[0];

  // Lo que pide una acción, de lo más urgente a lo que falta cargar.
  const attention: { key: string; tone: AttentionTone; title: string; detail?: string; href?: string }[] = [];
  for (const d of deadlines) {
    const days = daysUntil(d.due_date, today);
    if (days > 14) break;
    attention.push({
      key: `d-${d.id}`,
      tone: days <= 5 ? "danger" : "info",
      title: d.title,
      detail: `${whenLabel(days)} · ${formatDay(d.due_date)}`,
      href: "#vencimientos",
    });
  }
  for (const s of stages) {
    if (s.budget_pct !== null && Number(s.budget_pct) >= 100) {
      attention.push({
        key: `h-${s.id}`,
        tone: "danger",
        title: `«${s.name}» pasó las horas previstas`,
        detail: "¿Hubo cambios del cliente? Creá una orden de cambio",
        href: `${base}/ordenes?etapa=${s.id}`,
      });
    }
  }
  for (const o of waiting) {
    attention.push({
      key: `o-${o.id}`,
      tone: "warn",
      title: `${changeOrderCode(o.number)} esperando al cliente`,
      detail: `${o.title} · ${formatMoney(o.amount, o.currency)}`,
      href: `${base}/ordenes`,
    });
  }
  if (toReview > 0) {
    attention.push({
      key: "pieces",
      tone: "info",
      title: toReview === 1 ? "1 pieza a revisar" : `${toReview} piezas a revisar`,
      detail: "Se reemplazó la revisión sobre la que se hicieron",
      href: `${base}/documentos#piezas`,
    });
  }
  for (const s of stages) {
    if (s.index_missing) {
      attention.push({
        key: `i-${s.id}`,
        tone: "neutral",
        title: `Falta ${s.index_name} de ${formatPeriod(s.index_base_period)}`,
        detail: `El honorario de «${s.name}» no se actualiza`,
        href: "/indices",
      });
    }
  }
  for (const m of missing) {
    attention.push({
      key: `c-${m.user_id}`,
      tone: "neutral",
      title: `Falta el costo por hora de ${emails.get(m.user_id) ?? "un ex miembro"}`,
      detail: `${formatHours(m.hours)} que no restan en el resultado`,
      href: "/equipo",
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className={`grid grid-cols-2 gap-3 sm:gap-4 ${showResult || next ? "xl:grid-cols-4" : "xl:grid-cols-3"}`}>
        <StatCard label="Honorarios" value={<span className="tabular">{fees.main}</span>} hint={fees.rest ? `y ${fees.rest} · con índice y adicionales` : "Con índice y adicionales"} />
        <StatCard
          label="Horas usadas"
          value={<span className="tabular">{hoursPct === null ? formatHours(used) : pctLabel(hoursPct)}</span>}
          hint={budget > 0 ? `${formatHours(used)} de ${formatHours(budget)}` : "Sin horas previstas"}
          tone={hoursTone === "danger" || hoursTone === "warn" ? hoursTone : "muted"}
        >
          {hoursPct !== null && <ProgressBar pct={hoursPct} className="mt-1" />}
        </StatCard>
        <StatCard
          label="Adicionales aprobados"
          value={<span className="tabular">{extras.main}</span>}
          hint={`${extras.rest ? `y ${extras.rest} · ` : ""}${
            pending.main !== "—"
              ? `${[pending.main, pending.rest].filter(Boolean).join(" y ")} esperando respuesta`
              : `${extras.rest ? "n" : "N"}inguno esperando respuesta`
          }`}
          tone={pending.main !== "—" ? "warn" : "muted"}
        />
        {showResult ? (
          <StatCard
            dark
            label="Resultado · solo vos"
            value={<span className="tabular">{result ? roundMoney(result.profit, result.currency) : "—"}</span>}
            hint={
              result && Number(result.income) > 0
                ? `${pctLabel(Math.round((1000 * Number(result.profit)) / Number(result.income)) / 10)} del honorario`
                : "Con horas y costos cargados"
            }
          />
        ) : (
          next && (
            <StatCard
              label="Próximo vencimiento"
              value={formatDay(next.due_date)}
              hint={`${next.title} · ${whenLabel(daysUntil(next.due_date, today))}`}
              tone={daysUntil(next.due_date, today) <= 5 ? "danger" : "muted"}
            />
          )
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <section className="card flex flex-col gap-4 lg:col-span-3" aria-labelledby="horas-por-etapa">
          <div className="flex items-baseline gap-3">
            <h2 id="horas-por-etapa" className="font-bold">Horas por etapa</h2>
            <Link href={`${base}/honorarios`} className="ml-auto text-sm font-semibold text-accent hover:underline">
              Ver honorarios
            </Link>
          </div>
          {stages.length === 0 ? (
            <p className="text-sm text-muted">
              Todavía no hay etapas.{" "}
              {isOwner ? (
                <Link href={`${base}/honorarios`} className="font-semibold text-accent underline">
                  Cargalas en Honorarios
                </Link>
              ) : (
                "Las carga el dueño del estudio."
              )}
            </p>
          ) : (
            <ul className="flex flex-col gap-4">
              {stages.map((s) => {
                const pct = s.budget_pct === null ? null : Number(s.budget_pct);
                const tone = progressTone(pct);
                return (
                  <li key={s.id} className="flex flex-col gap-1.5">
                    <div className="flex items-baseline gap-3 text-sm">
                      <span className="min-w-0 flex-1 font-semibold">{s.name}</span>
                      <span className="tabular whitespace-nowrap text-subtle">
                        {formatHours(s.hours_used)}
                        {s.budget_hours !== null && ` / ${formatHours(s.budget_hours)}`}
                      </span>
                    </div>
                    <ProgressBar pct={pct} />
                    {pct === null ? (
                      <span className="text-xs text-muted">Sin horas previstas</span>
                    ) : (
                      <span className={`text-xs ${tone === "danger" ? "font-semibold text-danger" : tone === "warn" ? "font-semibold text-warn" : "text-muted"}`}>
                        {pctLabel(pct)}
                        {tone === "danger" ? " · pasó lo previsto" : tone === "warn" ? " · cerca del límite" : ""}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="card order-first flex flex-col gap-3 lg:order-none lg:col-span-2" aria-labelledby="para-atender">
          <h2 id="para-atender" className="font-bold">Para atender</h2>
          {attention.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-muted">
              <CircleCheck aria-hidden="true" size={18} className="text-ok" />
              Nada pendiente en este proyecto.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {attention.map(({ key, ...item }) => (
                <li key={key}>
                  <AttentionItem {...item} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <section id="vencimientos" className="card flex scroll-mt-6 flex-col gap-4 lg:col-span-3" aria-labelledby="vencimientos-titulo">
          <div className="flex flex-wrap items-baseline gap-3">
            <h2 id="vencimientos-titulo" className="font-bold">Vencimientos</h2>
            <Link href="/vencimientos" className="ml-auto text-sm font-semibold text-accent hover:underline">
              Ver todos
            </Link>
          </div>
          {deadlines.length > 0 ? (
            <DeadlineList deadlines={deadlines} showProject={false} now={now} />
          ) : (
            <p className="text-sm text-muted">No hay vencimientos pendientes.</p>
          )}
          <Disclosure
            defaultOpen={false}
            className="rounded-[var(--radius-control)] border border-dashed border-line-strong"
            summary="Nuevo vencimiento"
            summaryClassName="cursor-pointer px-4 py-3 text-sm font-semibold"
          >
            <div className="border-t border-line p-4">
              <DeadlineForm projectId={projectId} />
            </div>
          </Disclosure>
        </section>

        <section className="card flex flex-col gap-4 lg:col-span-2" aria-labelledby="actividad-reciente">
          <div className="flex items-baseline gap-3">
            <h2 id="actividad-reciente" className="font-bold">Actividad reciente</h2>
            <Link href={`${base}/historial`} className="ml-auto text-sm font-semibold text-accent hover:underline">
              Ver toda
            </Link>
          </div>
          {events.length === 0 ? (
            <p className="text-sm text-muted">Todavía no pasó nada en este proyecto.</p>
          ) : (
            <ol className="flex flex-col gap-3 text-sm">
              {events.map((e) => (
                <li key={e.id} className="flex flex-col gap-0.5">
                  <span>{eventText(e)}</span>
                  <time dateTime={e.created_at} className="text-xs text-muted">
                    {dateFmt.format(new Date(e.created_at))}
                  </time>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}
