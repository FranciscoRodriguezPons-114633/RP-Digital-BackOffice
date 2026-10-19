import Link from "next/link";
import { SubmitButton } from "@/components/form";
import { StatusPill, type PillTone } from "@/components/status-pill";
import { formatDay, todayInCordoba } from "@/lib/format";
import { setDeadlineDone } from "../deadline-actions";

export type DeadlineRow = {
  id: string;
  project_id: string | null;
  title: string;
  due_date: string;
  notify_days: number[];
  notes: string | null;
  done_at: string | null;
  projects: { name: string } | null;
};

export const DEADLINE_SELECT = "id, project_id, title, due_date, notify_days, notes, done_at, projects(name)";

// Días entre hoy (Córdoba) y la fecha, sin depender de la hora.
function daysUntil(isoDate: string, today: string) {
  return Math.round((Date.parse(`${isoDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
}

function whenLabel(days: number) {
  if (days < 0) return days === -1 ? "Venció ayer" : `Venció hace ${-days} días`;
  if (days === 0) return "Vence hoy";
  if (days === 1) return "Vence mañana";
  return `Faltan ${days} días`;
}

export function DeadlineList({
  deadlines,
  showProject,
  now,
}: {
  deadlines: DeadlineRow[];
  showProject: boolean;
  now: Date;
}) {
  const today = todayInCordoba(now);
  return (
    <ul className="flex flex-col divide-y divide-line">
      {deadlines.map((d) => {
        const days = daysUntil(d.due_date, today);
        const tone: PillTone = d.done_at ? "ok" : days < 0 ? "danger" : days <= 5 ? "warn" : days <= 30 ? "info" : "neutral";
        return (
          <li key={d.id} className={`flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3 first:pt-0 ${d.done_at ? "opacity-60" : ""}`}>
            <span className="font-mono text-sm whitespace-nowrap">{formatDay(d.due_date)}</span>
            <span className={`min-w-0 flex-1 font-medium ${d.done_at ? "line-through" : ""}`}>{d.title}</span>
            <StatusPill tone={tone} className="self-center">{d.done_at ? "Hecho" : whenLabel(days)}</StatusPill>
            <form action={setDeadlineDone.bind(null, d.project_id, d.id, !d.done_at)}>
              <SubmitButton variant="ghost" pendingLabel="…">{d.done_at ? "Reabrir" : "Marcar hecho"}</SubmitButton>
            </form>
            <div className="flex w-full flex-wrap gap-x-3 text-xs text-muted">
              {showProject &&
                (d.project_id && d.projects ? (
                  <Link href={`/proyectos/${d.project_id}`} className="underline">
                    {d.projects.name}
                  </Link>
                ) : (
                  <span>Del estudio</span>
                ))}
              {!d.done_at && <span>Avisos {d.notify_days.join(", ")} días antes</span>}
              {d.notes && <span>{d.notes}</span>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
