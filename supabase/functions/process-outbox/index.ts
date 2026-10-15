// Edge Function: procesa la cola `outbox` y envía los correos con Resend.
// La dispara Supabase Cron cada minuto (ver docs/operacion.md).
import { createClient } from "npm:@supabase/supabase-js@2";
import { renderEmail, type OutboxMessage } from "./templates.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const RESEND_API_URL = Deno.env.get("RESEND_API_URL") ?? "https://api.resend.com/emails";
const EMAIL_FROM = Deno.env.get("EMAIL_FROM") ?? "RP Backoffice <onboarding@resend.dev>";
const APP_URL = Deno.env.get("APP_URL") ?? "http://localhost:3000";
const CRON_SECRET = Deno.env.get("OUTBOX_CRON_SECRET") ?? "";
const BATCH = 20;

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function send(msg: OutboxMessage) {
  const email = renderEmail(msg, APP_URL);
  const res = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
      // Si un reintento repite el envío, Resend no manda el correo dos veces.
      "Idempotency-Key": `outbox-${msg.id}`,
    },
    body: JSON.stringify({ from: EMAIL_FROM, to: [msg.to_email], ...email }),
  });
  if (!res.ok) {
    throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 500)}`);
  }
}

Deno.serve(async (req) => {
  if (!CRON_SECRET || req.headers.get("Authorization") !== `Bearer ${CRON_SECRET}`) {
    return new Response("No autorizado", { status: 401 });
  }
  if (!RESEND_API_KEY) {
    return new Response("Falta RESEND_API_KEY", { status: 500 });
  }

  const { data, error } = await db.rpc("claim_outbox", { p_limit: BATCH });
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const messages = (data ?? []) as OutboxMessage[];
  let sent = 0;
  let failed = 0;

  for (const msg of messages) {
    try {
      await send(msg);
      await db.rpc("complete_outbox", { p_id: msg.id, p_ok: true });
      sent++;
    } catch (e) {
      await db.rpc("complete_outbox", { p_id: msg.id, p_ok: false, p_error: String(e) });
      failed++;
    }
  }

  return Response.json({ claimed: messages.length, sent, failed });
});
