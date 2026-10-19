-- Sprint 5 · E13: planes, prueba de 30 días y pase a pago con cobro manual
-- Cada estudio arranca con 30 días de prueba. El dueño pide pasar a un plan desde la app
-- (con sus datos de facturación); quien administra la plataforma lo aprueba desde un panel
-- cuando llega la transferencia. Nada de esto necesita tocar la base a mano.

alter table public.organizations
  add column plan text not null default 'trial' check (plan in ('trial', 'estudio', 'pro')),
  add column trial_ends_at timestamptz not null default now() + interval '30 days',
  add column paid_until date;

-- Administradores de la plataforma (no de un estudio). Se cargan a mano, una vez.
create table public.platform_admins (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);
alter table public.platform_admins enable row level security;
revoke all on public.platform_admins from anon, authenticated;

create or replace function private.is_platform_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.platform_admins a where a.user_id = (select auth.uid()));
$$;

create table public.billing_requests (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id) on delete cascade,
  plan          text not null check (plan in ('estudio', 'pro')),
  billing_cycle text not null default 'monthly' check (billing_cycle in ('monthly', 'yearly')),
  billing_name  text not null check (length(btrim(billing_name)) between 2 and 160),
  tax_id        text not null check (tax_id ~ '^[0-9]{2}-?[0-9]{8}-?[0-9]$'),  -- CUIT
  billing_email text not null check (billing_email = lower(btrim(billing_email)) and position('@' in billing_email) > 1),
  status        text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_by    uuid references auth.users (id),
  decided_at    timestamptz,
  paid_until    date,
  note          text check (length(note) <= 500),
  created_by    uuid not null references auth.users (id),
  created_at    timestamptz not null default now()
);
create index billing_requests_org_idx on public.billing_requests (org_id);
create unique index billing_requests_one_pending on public.billing_requests (org_id) where status = 'pending';

alter table public.billing_requests enable row level security;
create policy billing_requests_select on public.billing_requests
for select to authenticated
using ((select private.is_org_owner(org_id)) or (select private.is_platform_admin()));
revoke all on public.billing_requests from anon;
revoke insert, update, delete on public.billing_requests from authenticated;

-- El plan solo lo cambia la plataforma: el dueño no puede editarlo desde la app.
revoke update on public.organizations from authenticated;
grant update (name) on public.organizations to authenticated;

-- ---------------------------------------------------------------------------
-- RPC
-- ---------------------------------------------------------------------------
create or replace function public.request_paid_plan(
  p_org_id uuid, p_plan text, p_billing_cycle text, p_billing_name text, p_tax_id text, p_billing_email text)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_org_name text;
  v_event bigint;
begin
  if not private.is_org_owner(p_org_id) then
    raise exception 'Solo el dueño del estudio pide el pase a pago' using errcode = '42501';
  end if;
  if exists (select 1 from public.billing_requests where org_id = p_org_id and status = 'pending') then
    raise exception 'Ya hay un pedido pendiente' using errcode = '23505';
  end if;

  insert into public.billing_requests (org_id, plan, billing_cycle, billing_name, tax_id, billing_email, created_by)
  values (p_org_id, p_plan, coalesce(p_billing_cycle, 'monthly'), btrim(p_billing_name),
          regexp_replace(btrim(p_tax_id), '[^0-9]', '', 'g'), lower(btrim(p_billing_email)), (select auth.uid()))
  returning id into v_id;

  select name into v_org_name from public.organizations where id = p_org_id;
  v_event := private.log_event(p_org_id, 'billing.requested', 'billing_request', v_id,
    jsonb_build_object('plan', p_plan, 'billing_cycle', coalesce(p_billing_cycle, 'monthly')));

  -- Aviso a quien administra la plataforma, para mandar los datos de la transferencia.
  insert into public.outbox (org_id, event_id, kind, to_email, payload)
  select p_org_id, v_event, 'billing_requested', lower(u.email),
         jsonb_build_object('org_name', v_org_name, 'plan', p_plan, 'billing_cycle', coalesce(p_billing_cycle, 'monthly'),
                            'billing_name', btrim(p_billing_name), 'billing_email', lower(btrim(p_billing_email)))
  from public.platform_admins a join auth.users u on u.id = a.user_id;
  return v_id;
end;
$$;

-- La plataforma confirma el pago (o rechaza el pedido). Aprobado, el estudio pasa al plan.
create or replace function public.decide_billing_request(
  p_id uuid, p_approve boolean, p_paid_until date default null, p_note text default null)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_req public.billing_requests%rowtype;
  v_event bigint;
begin
  if not private.is_platform_admin() then
    raise exception 'Solo la administración de la plataforma confirma pagos' using errcode = '42501';
  end if;
  select * into v_req from public.billing_requests where id = p_id for update;
  if not found or v_req.status <> 'pending' then
    raise exception 'El pedido no está pendiente' using errcode = '22023';
  end if;
  if p_approve and (p_paid_until is null or p_paid_until <= (now() at time zone 'America/Argentina/Cordoba')::date) then
    raise exception 'Indicá hasta cuándo está pago' using errcode = '23514';
  end if;

  update public.billing_requests
  set status = case when p_approve then 'approved' else 'rejected' end, decided_by = (select auth.uid()),
      decided_at = now(), paid_until = case when p_approve then p_paid_until end, note = nullif(btrim(p_note), '')
  where id = p_id;

  if p_approve then
    update public.organizations set plan = v_req.plan, paid_until = p_paid_until where id = v_req.org_id;
  end if;

  v_event := private.log_event(v_req.org_id, case when p_approve then 'billing.approved' else 'billing.rejected' end,
    'billing_request', p_id, jsonb_build_object('plan', v_req.plan, 'paid_until', p_paid_until));

  insert into public.outbox (org_id, event_id, kind, to_email, payload)
  values (v_req.org_id, v_event, 'billing_decided', v_req.billing_email,
          jsonb_build_object('approved', p_approve, 'plan', v_req.plan, 'paid_until', p_paid_until,
                             'note', nullif(btrim(p_note), '')));
end;
$$;

-- Estado del plan para la app (dueños y miembros lo ven; el pedido, solo el dueño).
create or replace function public.org_plan_status(p_org_id uuid)
returns table (plan text, trial_ends_at timestamptz, paid_until date, members integer, active_projects integer)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not private.is_org_member(p_org_id) then
    raise exception 'No tenés acceso a este estudio' using errcode = '42501';
  end if;
  return query
  select o.plan, o.trial_ends_at, o.paid_until,
         (select count(*)::integer from public.memberships m where m.org_id = o.id),
         (select count(*)::integer from public.projects p where p.org_id = o.id and p.status = 'active')
  from public.organizations o where o.id = p_org_id;
end;
$$;

-- Para el panel de la plataforma: pedidos con el nombre del estudio.
create or replace function public.list_billing_requests()
returns table (id uuid, org_id uuid, org_name text, plan text, billing_cycle text, billing_name text, tax_id text,
               billing_email text, status text, created_at timestamptz, paid_until date)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not private.is_platform_admin() then
    raise exception 'Solo la administración de la plataforma' using errcode = '42501';
  end if;
  return query
  select r.id, r.org_id, o.name, r.plan, r.billing_cycle, r.billing_name, r.tax_id, r.billing_email, r.status,
         r.created_at, r.paid_until
  from public.billing_requests r join public.organizations o on o.id = r.org_id
  order by (r.status = 'pending') desc, r.created_at desc
  limit 200;
end;
$$;

revoke execute on function public.request_paid_plan(uuid, text, text, text, text, text) from public, anon;
revoke execute on function public.decide_billing_request(uuid, boolean, date, text) from public, anon;
revoke execute on function public.org_plan_status(uuid) from public, anon;
revoke execute on function public.list_billing_requests() from public, anon;
grant execute on function public.request_paid_plan(uuid, text, text, text, text, text) to authenticated;
grant execute on function public.decide_billing_request(uuid, boolean, date, text) to authenticated;
grant execute on function public.org_plan_status(uuid) to authenticated;
grant execute on function public.list_billing_requests() to authenticated;

revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;
