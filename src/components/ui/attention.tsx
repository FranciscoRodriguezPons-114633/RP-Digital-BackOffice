import Link from "next/link";
import type { ReactNode } from "react";

// «Para atender»: lo que pide una acción, con su color de urgencia.
// danger: vencido o por vencer · warn: espera a alguien · info: hay algo nuevo · neutral: falta un dato.
export type AttentionTone = "danger" | "warn" | "info" | "neutral";

const TONE: Record<AttentionTone, { box: string; dot: string }> = {
  danger: { box: "bg-danger-soft", dot: "bg-danger" },
  warn: { box: "bg-warn-soft", dot: "bg-warn" },
  info: { box: "bg-info-soft", dot: "bg-info" },
  neutral: { box: "bg-sunken", dot: "bg-muted" },
};

export function AttentionItem({
  tone,
  title,
  detail,
  href,
}: {
  tone: AttentionTone;
  title: string;
  detail?: ReactNode;
  href?: string;
}) {
  const t = TONE[tone];
  const body = (
    <>
      <span aria-hidden="true" className={`mt-1.5 size-2.5 shrink-0 rounded-full ${t.dot}`} />
      <span className="min-w-0 text-sm">
        <span className="block font-semibold text-foreground">{title}</span>
        {detail && <span className="block text-subtle">{detail}</span>}
      </span>
    </>
  );
  const cls = `flex gap-3 rounded-[var(--radius-control)] p-3 ${t.box}`;
  return href ? (
    <Link href={href} className={`${cls} outline-none hover:brightness-[0.98] focus-visible:ring-3 focus-visible:ring-focus`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
