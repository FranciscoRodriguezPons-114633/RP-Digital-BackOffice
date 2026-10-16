-- Sprint 3 · Cierre de E4 (aprobación por link) y E5 (panel de lo recuperado)
-- El estudio envía una orden; el cliente la aprueba o rechaza desde un link, sin cuenta.
-- El token se guarda solo como hash, vence, sirve una sola vez y deja de valer si la
-- orden cambia. Cada decisión guarda quién, cuándo y la huella del contenido aprobado.

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------
create table public.approval_links (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations (id) on delete cascade,
  change_order_id  uuid not null references public.change_orders (id) on delete cascade,
  token_hash       text not null unique,
  recipient_email  text not null check (recipient_email = lower(btrim(recipient_email)) and position('@' in recipient_email) > 1),
  content_hash     text not null,  -- huella de la orden al momento del envío
  expires_at       timestamptz not null,
  used_at          timestamptz,
  revoked_at       timestamptz,    -- se envió otro link, se editó o se anuló la orden
  created_by       uuid not null references auth.users (id),
  created_at       timestamptz not null default now()
);
create index approval_links_org_id_idx on public.approval_links (org_id);
create index approval_links_change_order_id_idx on public.approval_links (change_order_id);
create index approval_links_recipient_idx on public.approval_links (recipient_email);

-- Decisiones del cliente: solo inserción.
create table public.approvals (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations (id) on delete cascade,
  change_order_id   uuid not null references public.change_orders (id) on delete cascade,
  approval_link_id  uuid not null unique references public.approval_links (id) on delete cascade,
  decision          text not null check (decision in ('approved', 'rejected')),
  signer_name       text not null check (length(btrim(signer_name)) between 2 and 120),
  signer_email      text not null,
  comment           text check (length(comment) <= 1000),
  content_hash      text not null,
  ip                text check (length(ip) <= 100),
  user_agent        text check (length(user_agent) <= 500),
  created_at        timestamptz not null default now()
);
create index approvals_org_id_idx on public.approvals (org_id);
create index approvals_change_order_id_idx on public.approvals (change_order_id);

-- ---------------------------------------------------------------------------
-- Órdenes: límites de documentos afectados en la base (no solo en la app)
-- ---------------------------------------------------------------------------
create or replace function private.change_order_before_write()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  -- Proyecto, organización y moneda salen de la etapa, solo al crear o al cambiar de etapa:
  -- un cambio de estado (anular, aprobar) nunca toca la moneda ni la huella.
  if tg_op = 'INSERT' or new.stage_id is distinct from old.stage_id then
    select s.org_id, s.project_id, s.currency into new.org_id, new.project_id, new.currency
    from public.fee_stages s where s.id = new.stage_id;
    if new.org_id is null then
      raise exception 'Etapa inexistente' using errcode = '23503';
    end if;
  end if;
  if cardinality(new.affected_documents) > 30
     or exists (select 1 from unnest(new.affected_documents) c where length(c) > 40) then
    raise exception 'Hasta 30 documentos afectados, de hasta 40 caracteres cada uno' using errcode = '23514';
  end if;
  new.content_hash := private.change_order_hash(new);
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

-- El cliente ve las órdenes que le enviaron (en la vista de invitado del proyecto).
create or replace function private.is_change_order_recipient(p_change_order_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.approval_links l
    where l.change_order_id = p_change_order_id and l.recipient_email = private.current_email()
  );
$$;

-- Avisa por correo a los dueños, a quien creó la orden y a quien la envió.
create or replace function private.notify_change_order_decision(
  p_co public.change_orders, p_link public.approval_links, p_event bigint, p_payload jsonb)
returns void
language sql security definer
set search_path = ''
as $$
  insert into public.outbox (org_id, event_id, kind, to_email, payload)
  select p_co.org_id, p_event, 'change_order_decided', lower(u.email), p_payload
  from public.memberships m
  join auth.users u on u.id = m.user_id
  where m.org_id = p_co.org_id
    and (m.role = 'owner' or m.user_id in (p_co.created_by, p_link.created_by));
$$;

-- ---------------------------------------------------------------------------
-- Seguridad por fila
-- ---------------------------------------------------------------------------
alter table public.approval_links enable row level security;
alter table public.approvals enable row level security;

create policy approval_links_select on public.approval_links
for select to authenticated using ((select private.is_org_member(org_id)));
create policy approvals_select on public.approvals
for select to authenticated using ((select private.is_org_member(org_id)));

create policy change_orders_select_recipient on public.change_orders
for select to authenticated using (private.is_change_order_recipient(id));

revoke all on public.approval_links, public.approvals from anon;
revoke insert, update, delete on public.approval_links, public.approvals from authenticated;

-- ---------------------------------------------------------------------------
-- RPC: crear, editar y anular (se rehacen para manejar los links enviados)
-- ---------------------------------------------------------------------------
create or replace function public.create_change_order(
  p_stage_id uuid, p_title text, p_description text, p_hours numeric, p_amount numeric,
  p_affected_documents text[] default '{}')
returns table (id uuid, number integer)
language plpgsql security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_stage public.fee_stages%rowtype;
  v_number integer;
  v_id uuid;
begin
  select * into v_stage from public.fee_stages where fee_stages.id = p_stage_id;
  if not found or not private.is_org_member(v_stage.org_id) then
    raise exception 'No tenés acceso a esta etapa' using errcode = '42501';
  end if;

  -- Numeración correlativa por proyecto, sin huecos por carreras entre dos personas.
  -- NO KEY UPDATE alcanza y no frena a quien carga horas en el mismo proyecto.
  perform 1 from public.projects where projects.id = v_stage.project_id for no key update;
  select coalesce(max(co.number), 0) + 1 into v_number
  from public.change_orders co where co.project_id = v_stage.project_id;

  insert into public.change_orders (org_id, project_id, stage_id, number, title, description, hours,
                                    amount, currency, affected_documents, content_hash, created_by)
  values (v_stage.org_id, v_stage.project_id, p_stage_id, v_number, btrim(p_title),
          nullif(btrim(p_description), ''), p_hours, p_amount, v_stage.currency,
          coalesce(p_affected_documents, '{}'), '', (select auth.uid()))
  returning change_orders.id into v_id;

  perform private.log_event(v_stage.org_id, 'change_order.created', 'change_order', v_id,
    jsonb_build_object('project_id', v_stage.project_id, 'number', v_number,
                       'title', btrim(p_title), 'amount', p_amount, 'currency', v_stage.currency));
  return query select v_id, v_number;
end;
$$;

-- Editar una orden enviada la vuelve a borrador y anula el link: el cliente no puede
-- aprobar algo distinto de lo que se le mandó.
create or replace function public.update_change_order(
  p_id uuid, p_stage_id uuid, p_title text, p_description text, p_hours numeric, p_amount numeric,
  p_affected_documents text[] default '{}')
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_co public.change_orders%rowtype;
  v_new_stage public.fee_stages%rowtype;
  v_new_hash text;
  v_revoked integer := 0;
begin
  select * into v_co from public.change_orders where id = p_id for update;
  if not found or not private.is_org_member(v_co.org_id) then
    raise exception 'No tenés acceso a esta orden' using errcode = '42501';
  end if;
  if v_co.status not in ('draft', 'sent') then
    raise exception 'Una orden % no se puede editar', v_co.status using errcode = '22023';
  end if;
  select * into v_new_stage from public.fee_stages where id = p_stage_id;
  if not found or v_new_stage.project_id <> v_co.project_id then
    raise exception 'La etapa tiene que ser del mismo proyecto' using errcode = '23514';
  end if;

  update public.change_orders
  set stage_id = p_stage_id, title = btrim(p_title), description = nullif(btrim(p_description), ''),
      hours = p_hours, amount = p_amount, affected_documents = coalesce(p_affected_documents, '{}')
  where id = p_id
  returning content_hash into v_new_hash;

  if v_new_hash = v_co.content_hash then
    return;
  end if;

  if v_co.status = 'sent' then
    update public.change_orders set status = 'draft' where id = p_id;
    update public.approval_links set revoked_at = now()
    where change_order_id = p_id and used_at is null and revoked_at is null;
    get diagnostics v_revoked = row_count;
  end if;

  perform private.log_event(v_co.org_id, 'change_order.updated', 'change_order', p_id,
    jsonb_build_object('project_id', v_co.project_id, 'number', v_co.number, 'title', btrim(p_title),
                       'previous_hash', v_co.content_hash, 'content_hash', v_new_hash,
                       'links_revoked', v_revoked));
end;
$$;

create or replace function public.void_change_order(p_id uuid, p_reason text)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_co public.change_orders%rowtype;
begin
  select * into v_co from public.change_orders where id = p_id for update;
  if not found or not private.is_org_owner(v_co.org_id) then
    raise exception 'Solo el dueño del estudio puede anular órdenes' using errcode = '42501';
  end if;
  if v_co.status = 'void' then
    return;
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Indicá el motivo de la anulación' using errcode = '22023';
  end if;

  update public.change_orders
  set status = 'void', voided_at = now(), void_reason = btrim(p_reason)
  where id = p_id;
  update public.approval_links set revoked_at = now()
  where change_order_id = p_id and used_at is null and revoked_at is null;

  perform private.log_event(v_co.org_id, 'change_order.voided', 'change_order', p_id,
    jsonb_build_object('project_id', v_co.project_id, 'number', v_co.number, 'title', v_co.title,
                       'previous_status', v_co.status, 'reason', btrim(p_reason)));
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: envío al cliente
-- ---------------------------------------------------------------------------
-- Devuelve el token una sola vez (para mostrar el link y copiarlo a WhatsApp); en la base
-- queda solo su hash. El correo lo lleva en el outbox hasta que sale, y después se borra.
create or replace function public.send_change_order(
  p_id uuid, p_recipient_email text, p_valid_days integer default 14)
returns table (token text, expires_at timestamptz)
language plpgsql security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_co public.change_orders%rowtype;
  v_email text := lower(btrim(coalesce(p_recipient_email, '')));
  v_token text;
  v_expires timestamptz;
  v_project_name text;
  v_org_name text;
  v_stage_name text;
  v_event bigint;
begin
  select * into v_co from public.change_orders co where co.id = p_id for update;
  if not found or not private.is_org_member(v_co.org_id) then
    raise exception 'No tenés acceso a esta orden' using errcode = '42501';
  end if;
  if v_co.status not in ('draft', 'sent') then
    raise exception 'Una orden % no se puede enviar', v_co.status using errcode = '22023';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Correo inválido' using errcode = '23514';
  end if;
  if p_valid_days is null or p_valid_days not between 1 and 60 then
    raise exception 'El link vence entre 1 y 60 días' using errcode = '23514';
  end if;

  -- Un solo link vigente por orden: el nuevo reemplaza a los anteriores.
  update public.approval_links l set revoked_at = now()
  where l.change_order_id = p_id and l.used_at is null and l.revoked_at is null;

  v_token := rtrim(translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), '=');
  v_expires := now() + make_interval(days => p_valid_days);

  insert into public.approval_links (org_id, change_order_id, token_hash, recipient_email,
                                     content_hash, expires_at, created_by)
  values (v_co.org_id, p_id, encode(extensions.digest(v_token, 'sha256'), 'hex'), v_email,
          v_co.content_hash, v_expires, (select auth.uid()));

  update public.change_orders co set status = 'sent', sent_at = now() where co.id = p_id;

  select p.name, o.name into v_project_name, v_org_name
  from public.projects p join public.organizations o on o.id = p.org_id
  where p.id = v_co.project_id;
  select s.name into v_stage_name from public.fee_stages s where s.id = v_co.stage_id;

  v_event := private.log_event(v_co.org_id, 'change_order.sent', 'change_order', p_id,
    jsonb_build_object('project_id', v_co.project_id, 'number', v_co.number, 'title', v_co.title,
                       'recipient_email', v_email, 'expires_at', v_expires));

  insert into public.outbox (org_id, event_id, kind, to_email, payload)
  values (v_co.org_id, v_event, 'change_order_sent', v_email,
          jsonb_build_object('token', v_token, 'org_name', v_org_name, 'project_name', v_project_name,
                             'stage_name', v_stage_name, 'number', v_co.number, 'title', v_co.title,
                             'amount', v_co.amount, 'currency', v_co.currency, 'expires_at', v_expires));

  return query select v_token, v_expires;
end;
$$;

-- El token sale del outbox cuando el correo se envió o se dio por perdido.
create or replace function public.complete_outbox(p_id bigint, p_ok boolean, p_error text default null)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  update public.outbox
  set status = case when p_ok then 'sent' when attempts >= 5 then 'failed' else 'pending' end,
      sent_at = case when p_ok then now() end,
      last_error = case when p_ok then null else left(p_error, 1000) end,
      next_try_at = case when p_ok then next_try_at else now() + make_interval(mins => attempts * attempts) end,
      payload = case when p_ok or attempts >= 5 then payload - 'token' else payload end
  where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: página pública del cliente (sin sesión)
-- ---------------------------------------------------------------------------
-- Estado del link: valid, invalid, expired, used, changed, revoked o void.
-- Con un token que no existe no devuelve nada más que 'invalid'.
create or replace function public.get_change_order_for_approval(p_token text)
returns table (
  state text, org_name text, project_name text, stage_name text, number integer, title text,
  description text, hours numeric, amount numeric, currency text, affected_documents text[],
  recipient_email text, sent_at timestamptz, expires_at timestamptz,
  decision text, decided_at timestamptz, signer_name text)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_link public.approval_links%rowtype;
  v_co public.change_orders%rowtype;
  v_approval public.approvals%rowtype;
  v_state text;
begin
  select * into v_link from public.approval_links l
  where l.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
  if not found then
    return query select 'invalid'::text, null::text, null::text, null::text, null::integer, null::text,
      null::text, null::numeric, null::numeric, null::text, null::text[], null::text,
      null::timestamptz, null::timestamptz, null::text, null::timestamptz, null::text;
    return;
  end if;

  select * into v_co from public.change_orders co where co.id = v_link.change_order_id;
  select * into v_approval from public.approvals a where a.approval_link_id = v_link.id;

  v_state := case
    when v_link.used_at is not null then 'used'
    when v_co.status = 'void' then 'void'
    when v_co.content_hash <> v_link.content_hash then 'changed'
    when v_link.revoked_at is not null then 'revoked'
    when v_link.expires_at <= now() then 'expired'
    when v_co.status <> 'sent' then 'revoked'
    else 'valid' end;

  return query
  select v_state, o.name, p.name, s.name, v_co.number, v_co.title, v_co.description, v_co.hours,
         v_co.amount, v_co.currency, v_co.affected_documents, v_link.recipient_email,
         v_link.created_at, v_link.expires_at, v_approval.decision, v_approval.created_at,
         v_approval.signer_name
  from public.projects p
  join public.organizations o on o.id = p.org_id
  left join public.fee_stages s on s.id = v_co.stage_id
  where p.id = v_co.project_id;
end;
$$;

create or replace function public.decide_change_order(
  p_token text, p_decision text, p_signer_name text, p_comment text default null,
  p_ip text default null, p_user_agent text default null)
returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  v_link public.approval_links%rowtype;
  v_co public.change_orders%rowtype;
  v_project_name text;
  v_event bigint;
begin
  if p_decision is null or p_decision not in ('approved', 'rejected') then
    raise exception 'Decisión inválida' using errcode = '23514';
  end if;
  if length(btrim(coalesce(p_signer_name, ''))) not between 2 and 120 then
    raise exception 'Escribí tu nombre y apellido' using errcode = '23514';
  end if;

  select * into v_link from public.approval_links l
  where l.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
  for update;
  if not found then
    raise exception 'Link inválido' using errcode = '22023';
  end if;
  select * into v_co from public.change_orders co where co.id = v_link.change_order_id for update;
  if v_link.used_at is not null or v_link.revoked_at is not null or v_link.expires_at <= now()
     or v_co.status <> 'sent' or v_co.content_hash <> v_link.content_hash then
    raise exception 'Este link ya no es válido' using errcode = '22023';
  end if;

  insert into public.approvals (org_id, change_order_id, approval_link_id, decision, signer_name,
                                signer_email, comment, content_hash, ip, user_agent)
  values (v_co.org_id, v_co.id, v_link.id, p_decision, btrim(p_signer_name), v_link.recipient_email,
          nullif(btrim(left(p_comment, 1000)), ''), v_co.content_hash, left(p_ip, 100), left(p_user_agent, 500));
  update public.approval_links set used_at = now() where id = v_link.id;
  update public.change_orders set status = p_decision, decided_at = now() where id = v_co.id;

  select name into v_project_name from public.projects where id = v_co.project_id;

  -- Quien decide no tiene sesión: el actor del evento es el correo al que se envió el link.
  insert into public.events (org_id, type, entity, entity_id, actor_id, actor_email, data)
  values (v_co.org_id, 'change_order.' || p_decision, 'change_order', v_co.id, (select auth.uid()),
          v_link.recipient_email,
          jsonb_build_object('project_id', v_co.project_id, 'number', v_co.number, 'title', v_co.title,
                             'signer_name', btrim(p_signer_name), 'amount', v_co.amount,
                             'currency', v_co.currency, 'content_hash', v_co.content_hash,
                             'comment', nullif(btrim(left(p_comment, 1000)), '')))
  returning id into v_event;

  perform private.notify_change_order_decision(v_co, v_link, v_event,
    jsonb_build_object('decision', p_decision, 'project_name', v_project_name, 'project_id', v_co.project_id,
                       'number', v_co.number, 'title', v_co.title, 'amount', v_co.amount,
                       'currency', v_co.currency, 'signer_name', btrim(p_signer_name),
                       'signer_email', v_link.recipient_email,
                       'comment', nullif(btrim(left(p_comment, 1000)), '')));
  return p_decision;
end;
$$;

-- ---------------------------------------------------------------------------
-- Panel de lo recuperado (respeta RLS de quien consulta)
-- ---------------------------------------------------------------------------
-- Aprobado = aprobadas o para facturar; esperando = enviadas al cliente; borradores = sin enviar.
create view public.change_order_recovery
with (security_invoker = true) as
select
  co.org_id, co.project_id, p.name as project_name, co.currency,
  count(*) filter (where co.status in ('approved', 'billable'))::integer as approved_count,
  coalesce(sum(co.amount) filter (where co.status in ('approved', 'billable')), 0)::numeric(14, 2) as approved_amount,
  count(*) filter (where co.status = 'sent')::integer as pending_count,
  coalesce(sum(co.amount) filter (where co.status = 'sent'), 0)::numeric(14, 2) as pending_amount,
  count(*) filter (where co.status = 'draft')::integer as draft_count,
  coalesce(sum(co.amount) filter (where co.status = 'draft'), 0)::numeric(14, 2) as draft_amount,
  count(*) filter (where co.status = 'rejected')::integer as rejected_count
from public.change_orders co
join public.projects p on p.id = co.project_id
group by co.org_id, co.project_id, p.name, co.currency;

-- Aprobado por mes (hora de Córdoba), según la fecha en que el cliente decidió.
create view public.change_order_recovery_monthly
with (security_invoker = true) as
select
  co.org_id, co.currency,
  date_trunc('month', co.decided_at at time zone 'America/Argentina/Cordoba')::date as month,
  count(*)::integer as approved_count,
  sum(co.amount)::numeric(14, 2) as approved_amount
from public.change_orders co
where co.status in ('approved', 'billable') and co.decided_at is not null
group by co.org_id, co.currency, 3;

revoke all on public.change_order_recovery, public.change_order_recovery_monthly from anon;
grant select on public.change_order_recovery, public.change_order_recovery_monthly to authenticated;

-- ---------------------------------------------------------------------------
-- Permisos de ejecución
-- ---------------------------------------------------------------------------
revoke execute on function public.send_change_order(uuid, text, integer) from public, anon;
grant execute on function public.send_change_order(uuid, text, integer) to authenticated;
-- La página del cliente funciona sin sesión.
revoke execute on function public.get_change_order_for_approval(text) from public;
revoke execute on function public.decide_change_order(text, text, text, text, text, text) from public;
grant execute on function public.get_change_order_for_approval(text) to anon, authenticated;
grant execute on function public.decide_change_order(text, text, text, text, text, text) to anon, authenticated;

revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;
