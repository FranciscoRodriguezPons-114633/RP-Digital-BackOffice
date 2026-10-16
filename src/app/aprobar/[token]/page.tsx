import { Suspense, type ReactNode } from "react";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { formatHours, formatMoney } from "@/lib/format";
import { changeOrderCode, isApprovalToken, type ApprovalLinkState } from "@/lib/validation";
import { DecisionForm } from "./decision-form";

// El token va en la URL: que no se indexe ni viaje en el Referer a otros sitios.
export const metadata: Metadata = {
  title: "Orden de cambio",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

type ApprovalView = {
  state: ApprovalLinkState;
  org_name: string | null;
  project_name: string | null;
  stage_name: string | null;
  number: number | null;
  title: string | null;
  description: string | null;
  hours: string | null;
  amount: string | null;
  currency: string | null;
  affected_documents: string[] | null;
  recipient_email: string | null;
  sent_at: string | null;
  expires_at: string | null;
  decision: "approved" | "rejected" | null;
  decided_at: string | null;
  signer_name: string | null;
};

const dateFmt = new Intl.DateTimeFormat("es-AR", { dateStyle: "long", timeZone: "America/Argentina/Cordoba" });
const dateTimeFmt = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "America/Argentina/Cordoba",
});

export default function ApprovalPage({ params }: PageProps<"/aprobar/[token]">) {
  return (
    <main className="flex flex-1 justify-center px-4 py-8 sm:py-12">
      <div className="flex w-full max-w-lg flex-col gap-4">
        <Suspense fallback={<p className="text-sm text-muted">Cargando la orden…</p>}>
          <Approval params={params} />
        </Suspense>
        <p className="text-center text-xs text-muted">RP Backoffice</p>
      </div>
    </main>
  );
}

async function Approval({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();
  const { data } = isApprovalToken(token)
    ? await supabase.rpc("get_change_order_for_approval", { p_token: token }).single<ApprovalView>()
    : { data: null };
  const v: ApprovalView | null = data && data.state !== "invalid" ? data : null;

  if (!v) {
    return (
      <Notice title="Este link no existe">
        Revisá que lo hayas copiado completo, o pedile al estudio que te lo reenvíe.
      </Notice>
    );
  }

  const org = v.org_name ?? "El estudio";
  const code = changeOrderCode(v.number ?? 0);

  switch (v.state) {
    case "valid":
      return (
        <>
          <OrderCard v={v} code={code} />
          <section className="card flex flex-col gap-4">
            <h2 className="font-medium">¿La aprobás?</h2>
            <p className="text-sm text-muted">
              Si la aprobás, {org} suma este adicional a los honorarios del proyecto. El link vence el{" "}
              {dateFmt.format(new Date(v.expires_at!))}.
            </p>
            <DecisionForm token={token} recipientEmail={v.recipient_email ?? ""} />
          </section>
        </>
      );
    case "used":
      return (
        <>
          <Notice title={v.decision === "approved" ? `Aprobaste ${code}` : `Rechazaste ${code}`} tone={v.decision === "approved" ? "ok" : "muted"}>
            Lo hizo {v.signer_name} el {dateTimeFmt.format(new Date(v.decided_at!))}; {org} ya recibió el aviso. Si fue
            un error, hablalo con el estudio.
          </Notice>
          <OrderCard v={v} code={code} />
        </>
      );
    case "changed":
      return (
        <Notice title={`${org} cambió ${code}`}>
          La orden «{v.title}» se modificó después de que te la enviaron, así que este link ya no sirve. Te van a mandar
          la versión nueva para que la revises.
        </Notice>
      );
    case "revoked":
      return (
        <Notice title="Hay un link más nuevo">
          {org} te reenvió {code} «{v.title}». Usá el último link que te llegó.
        </Notice>
      );
    case "expired":
      return (
        <Notice title="Este link venció">
          El link de {code} «{v.title}» venció el {dateFmt.format(new Date(v.expires_at!))}. Pedile a {org} que te lo
          reenvíe.
        </Notice>
      );
    case "void":
      return (
        <Notice title={`${org} anuló ${code}`}>
          La orden «{v.title}» quedó anulada: no hace falta que hagas nada.
        </Notice>
      );
    default:
      return null;
  }
}

function OrderCard({ v, code }: { v: ApprovalView; code: string }) {
  return (
    <article className="card flex flex-col gap-4">
      <div>
        <p className="text-sm text-muted">
          {v.org_name} · {v.project_name}
        </p>
        <h1 className="mt-1 text-xl font-semibold">{v.title}</h1>
        <p className="mt-1 font-mono text-xs text-muted">Orden de cambio {code}</p>
      </div>
      {v.description && <p className="text-sm whitespace-pre-line">{v.description}</p>}
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        {v.stage_name && (
          <>
            <dt className="text-muted">Etapa</dt>
            <dd>{v.stage_name}</dd>
          </>
        )}
        {v.hours !== null && (
          <>
            <dt className="text-muted">Horas</dt>
            <dd>{formatHours(v.hours)}</dd>
          </>
        )}
        {v.affected_documents && v.affected_documents.length > 0 && (
          <>
            <dt className="text-muted">Planos afectados</dt>
            <dd>{v.affected_documents.join(", ")}</dd>
          </>
        )}
      </dl>
      <div className="flex items-baseline justify-between gap-3 border-t border-line pt-4">
        <span className="text-sm text-muted">Monto del adicional</span>
        <span className="font-mono text-2xl font-semibold whitespace-nowrap">{formatMoney(v.amount, v.currency ?? "ARS")}</span>
      </div>
    </article>
  );
}

function Notice({ title, children, tone = "muted" }: { title: string; children: ReactNode; tone?: "ok" | "muted" }) {
  return (
    <section className="card flex flex-col gap-2">
      <h1 className={`text-lg font-semibold ${tone === "ok" ? "text-ok" : ""}`}>{title}</h1>
      <p className="text-sm text-muted">{children}</p>
    </section>
  );
}
