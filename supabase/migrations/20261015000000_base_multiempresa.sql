-- Sprint 0 · E0 Fundaciones
-- Multiempresa, roles, proyectos base, invitados, registro de eventos y outbox.
-- Regla general: todas las escrituras sensibles pasan por funciones (RPC) que
-- validan permisos y dejan un evento en la misma transacción.

create extension if not exists pgcrypto with schema extensions;

-- Esquema privado para funciones auxiliares de permisos (no expuesto por la API).
create schema if not exists private;
grant usage on schema private to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------

create table public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(btrim(name)) between 2 and 120),
  created_by  uuid not null references auth.users (id),
  created_at  timestamptz not null default now()
);

create table public.memberships (
  org_id      uuid not null references public.organizations (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        text not null check (role in ('owner', 'member')),
  created_at  timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index memberships_user_id_idx on public.memberships (user_id);

create table public.member_invitations (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations (id) on delete cascade,
  email        text not null check (email = lower(btrim(email)) and position('@' in email) > 1),
  role         text not null default 'member' check (role in ('owner', 'member')),
  invited_by   uuid not null references auth.users (id),
  created_at   timestamptz not null default now(),
  accepted_at  timestamptz,
  unique (org_id, email)
);
create index member_invitations_org_id_idx on public.member_invitations (org_id);
create index member_invitations_email_idx on public.member_invitations (email);

create table public.projects (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations (id) on delete cascade,
  name         text not null check (length(btrim(name)) between 2 and 160),
  code         text,
  client_name  text,
  status       text not null default 'active' check (status in ('active', 'archived')),
  created_by   uuid not null references auth.users (id),
  created_at   timestamptz not null default now()
);
create index projects_org_id_idx on public.projects (org_id);

create table public.project_guests (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations (id) on delete cascade,
  project_id   uuid not null references public.projects (id) on delete cascade,
  email        text not null check (email = lower(btrim(email)) and position('@' in email) > 1),
  kind         text not null check (kind in ('client', 'renderer', 'contractor')),
  user_id      uuid references auth.users (id) on delete set null,
  invited_by   uuid not null references auth.users (id),
  created_at   timestamptz not null default now(),
  accepted_at  timestamptz,
  unique (project_id, email)
);
create index project_guests_org_id_idx on public.project_guests (org_id);
create index project_guests_project_id_idx on public.project_guests (project_id);
create index project_guests_user_id_idx on public.project_guests (user_id);
create index project_guests_email_idx on public.project_guests (email);

-- Registro de eventos: solo inserción. Alimenta auditoría y avisos.
create table public.events (
  id           bigint generated always as identity primary key,
  org_id       uuid not null references public.organizations (id) on delete cascade,
  type         text not null,
  entity       text not null,
  entity_id    uuid,
  actor_id     uuid,
  actor_email  text,
  data         jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index events_org_id_created_at_idx on public.events (org_id, created_at desc);
create index events_entity_idx on public.events (entity, entity_id);

-- Cola de correos. La procesa la Edge Function `process-outbox` con service_role.
create table public.outbox (
  id           bigint generated always as identity primary key,
  org_id       uuid not null references public.organizations (id) on delete cascade,
  event_id     bigint references public.events (id) on delete set null,
  kind         text not null,
  to_email     text not null,
  payload      jsonb not null default '{}'::jsonb,
  status       text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed')),
  attempts     integer not null default 0,
  next_try_at  timestamptz not null default now(),
  last_error   text,
  created_at   timestamptz not null default now(),
  sent_at      timestamptz
);
create index outbox_pending_idx on public.outbox (status, next_try_at);

-- ---------------------------------------------------------------------------
-- Funciones auxiliares de permisos
-- ---------------------------------------------------------------------------

create or replace function private.is_org_member(p_org_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.org_id = p_org_id and m.user_id = (select auth.uid())
  );
$$;

create or replace function private.is_org_owner(p_org_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.org_id = p_org_id and m.user_id = (select auth.uid()) and m.role = 'owner'
  );
$$;

create or replace function private.is_project_guest(p_project_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.project_guests g
    where g.project_id = p_project_id and g.user_id = (select auth.uid())
  );
$$;

create or replace function private.is_guest_in_org(p_org_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.project_guests g
    where g.org_id = p_org_id and g.user_id = (select auth.uid())
  );
$$;

create or replace function private.current_email()
returns text
language sql stable security definer
set search_path = ''
as $$
  select lower(u.email) from auth.users u where u.id = (select auth.uid());
$$;

create or replace function private.log_event(
  p_org_id uuid, p_type text, p_entity text, p_entity_id uuid, p_data jsonb default '{}'::jsonb)
returns bigint
language plpgsql security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  insert into public.events (org_id, type, entity, entity_id, actor_id, actor_email, data)
  values (p_org_id, p_type, p_entity, p_entity_id, (select auth.uid()), private.current_email(),
          coalesce(p_data, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;

-- Trigger genérico: deja un evento por cada alta, cambio o baja de una tabla de negocio.
create or replace function private.audit_row()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_action text := case tg_op when 'INSERT' then 'created' when 'UPDATE' then 'updated' else 'deleted' end;
  v_entity text := regexp_replace(tg_table_name, 's$', '');
begin
  perform private.log_event(
    (v_row ->> 'org_id')::uuid,
    v_entity || '.' || v_action,
    v_entity,
    (v_row ->> 'id')::uuid,
    case when tg_op = 'UPDATE'
      then jsonb_build_object('before', to_jsonb(old), 'after', to_jsonb(new))
      else jsonb_build_object('row', v_row) end
  );
  return null;
end;
$$;

create trigger projects_audit
after insert or update or delete on public.projects
for each row execute function private.audit_row();

-- ---------------------------------------------------------------------------
-- Seguridad por fila
-- ---------------------------------------------------------------------------

alter table public.organizations      enable row level security;
alter table public.memberships        enable row level security;
alter table public.member_invitations enable row level security;
alter table public.projects           enable row level security;
alter table public.project_guests     enable row level security;
alter table public.events             enable row level security;
alter table public.outbox             enable row level security;

-- organizations: la ven sus miembros y los invitados de alguno de sus proyectos.
create policy organizations_select on public.organizations
for select to authenticated
using ((select private.is_org_member(id)) or (select private.is_guest_in_org(id)));

create policy organizations_update on public.organizations
for update to authenticated
using ((select private.is_org_owner(id)))
with check ((select private.is_org_owner(id)));

-- memberships: lectura para miembros; las altas y bajas van por RPC.
create policy memberships_select on public.memberships
for select to authenticated
using ((select private.is_org_member(org_id)));

create policy member_invitations_select on public.member_invitations
for select to authenticated
using ((select private.is_org_member(org_id)));

-- projects: miembros leen y escriben; invitados solo leen los suyos; baja solo del dueño.
create policy projects_select on public.projects
for select to authenticated
using ((select private.is_org_member(org_id)) or (select private.is_project_guest(id)));

create policy projects_insert on public.projects
for insert to authenticated
with check ((select private.is_org_member(org_id)) and created_by = (select auth.uid()));

create policy projects_update on public.projects
for update to authenticated
using ((select private.is_org_member(org_id)))
with check ((select private.is_org_member(org_id)));

create policy projects_delete on public.projects
for delete to authenticated
using ((select private.is_org_owner(org_id)));

-- project_guests: los ven los miembros y el propio invitado; las altas y bajas van por RPC.
create policy project_guests_select on public.project_guests
for select to authenticated
using ((select private.is_org_member(org_id)) or user_id = (select auth.uid()));

-- events: solo miembros (los invitados no ven la auditoría interna).
create policy events_select on public.events
for select to authenticated
using ((select private.is_org_member(org_id)));

-- outbox: sin políticas. Solo service_role (que saltea RLS) puede leerla.

revoke insert, update, delete on public.events from anon, authenticated;
revoke all on public.outbox from anon, authenticated;
revoke all on public.organizations, public.memberships, public.member_invitations,
  public.projects, public.project_guests, public.events from anon;

-- ---------------------------------------------------------------------------
-- RPC: operaciones con reglas
-- ---------------------------------------------------------------------------

-- Crea un estudio y deja a quien lo crea como dueño.
create or replace function public.create_organization(p_name text)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_org uuid;
begin
  if v_uid is null then
    raise exception 'Necesitás iniciar sesión' using errcode = '28000';
  end if;

  insert into public.organizations (name, created_by)
  values (btrim(p_name), v_uid)
  returning id into v_org;

  insert into public.memberships (org_id, user_id, role) values (v_org, v_uid, 'owner');

  perform private.log_event(v_org, 'organization.created', 'organization', v_org,
                            jsonb_build_object('name', btrim(p_name)));
  return v_org;
end;
$$;

-- Invita a un miembro del estudio (solo dueños).
create or replace function public.invite_member(p_org_id uuid, p_email text, p_role text default 'member')
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(p_email));
  v_id uuid;
  v_event bigint;
  v_org_name text;
begin
  if not private.is_org_owner(p_org_id) then
    raise exception 'Solo el dueño del estudio puede invitar miembros' using errcode = '42501';
  end if;
  if p_role not in ('owner', 'member') then
    raise exception 'Rol inválido: %', p_role using errcode = '22023';
  end if;

  insert into public.member_invitations (org_id, email, role, invited_by)
  values (p_org_id, v_email, p_role, (select auth.uid()))
  on conflict (org_id, email) do update set role = excluded.role
  returning id into v_id;

  select name into v_org_name from public.organizations where id = p_org_id;

  v_event := private.log_event(p_org_id, 'member.invited', 'member_invitation', v_id,
                               jsonb_build_object('email', v_email, 'role', p_role));

  insert into public.outbox (org_id, event_id, kind, to_email, payload)
  values (p_org_id, v_event, 'member_invitation', v_email,
          jsonb_build_object('org_name', v_org_name, 'role', p_role));
  return v_id;
end;
$$;

-- Invita a un externo (cliente, renderista o contratista) a un proyecto.
create or replace function public.invite_guest(p_project_id uuid, p_email text, p_kind text)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(p_email));
  v_project public.projects%rowtype;
  v_org_name text;
  v_id uuid;
  v_event bigint;
begin
  select * into v_project from public.projects where id = p_project_id;
  if not found or not private.is_org_member(v_project.org_id) then
    raise exception 'No tenés acceso a este proyecto' using errcode = '42501';
  end if;
  if p_kind not in ('client', 'renderer', 'contractor') then
    raise exception 'Tipo de invitado inválido: %', p_kind using errcode = '22023';
  end if;

  insert into public.project_guests (org_id, project_id, email, kind, invited_by, user_id, accepted_at)
  values (v_project.org_id, p_project_id, v_email, p_kind, (select auth.uid()),
          (select u.id from auth.users u where lower(u.email) = v_email),
          case when exists (select 1 from auth.users u where lower(u.email) = v_email) then now() end)
  on conflict (project_id, email) do update set kind = excluded.kind
  returning id into v_id;

  select name into v_org_name from public.organizations where id = v_project.org_id;

  v_event := private.log_event(v_project.org_id, 'guest.invited', 'project_guest', v_id,
                               jsonb_build_object('email', v_email, 'kind', p_kind, 'project_id', p_project_id));

  insert into public.outbox (org_id, event_id, kind, to_email, payload)
  values (v_project.org_id, v_event, 'guest_invitation', v_email,
          jsonb_build_object('org_name', v_org_name, 'project_name', v_project.name,
                             'project_id', p_project_id, 'kind', p_kind));
  return v_id;
end;
$$;

-- Quita a un invitado de un proyecto.
create or replace function public.remove_guest(p_guest_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_guest public.project_guests%rowtype;
begin
  select * into v_guest from public.project_guests where id = p_guest_id;
  if not found or not private.is_org_member(v_guest.org_id) then
    raise exception 'No tenés acceso a este invitado' using errcode = '42501';
  end if;

  delete from public.project_guests where id = p_guest_id;

  perform private.log_event(v_guest.org_id, 'guest.removed', 'project_guest', p_guest_id,
                            jsonb_build_object('email', v_guest.email, 'project_id', v_guest.project_id));
end;
$$;

-- Al iniciar sesión: vincula invitaciones pendientes con el usuario por su correo.
create or replace function public.claim_invitations()
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_email text := private.current_email();
  v_count integer := 0;
  r record;
begin
  if v_uid is null or v_email is null then
    return 0;
  end if;

  for r in
    update public.project_guests
    set user_id = v_uid, accepted_at = now()
    where email = v_email and user_id is null
    returning id, org_id, project_id
  loop
    perform private.log_event(r.org_id, 'guest.accepted', 'project_guest', r.id,
                              jsonb_build_object('project_id', r.project_id));
    v_count := v_count + 1;
  end loop;

  for r in
    update public.member_invitations
    set accepted_at = now()
    where email = v_email and accepted_at is null
    returning id, org_id, role
  loop
    insert into public.memberships (org_id, user_id, role)
    values (r.org_id, v_uid, r.role)
    on conflict (org_id, user_id) do nothing;
    perform private.log_event(r.org_id, 'member.joined', 'membership', v_uid,
                              jsonb_build_object('role', r.role));
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- Outbox: toma un lote de correos pendientes sin que dos procesos tomen el mismo.
create or replace function public.claim_outbox(p_limit integer default 20)
returns setof public.outbox
language sql security definer
set search_path = ''
as $$
  update public.outbox o
  set status = 'processing', attempts = o.attempts + 1
  where o.id in (
    select id from public.outbox
    where status = 'pending' and next_try_at <= now()
    order by id
    limit p_limit
    for update skip locked
  )
  returning o.*;
$$;

-- Outbox: marca el resultado del envío; reintenta con espera creciente hasta 5 veces.
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
      next_try_at = case when p_ok then next_try_at else now() + make_interval(mins => attempts * attempts) end
  where id = p_id;
end;
$$;

-- Permisos de ejecución: nada para anon; outbox solo para service_role.
revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;

revoke execute on function public.create_organization(text) from public, anon;
revoke execute on function public.invite_member(uuid, text, text) from public, anon;
revoke execute on function public.invite_guest(uuid, text, text) from public, anon;
revoke execute on function public.remove_guest(uuid) from public, anon;
revoke execute on function public.claim_invitations() from public, anon;
grant execute on function public.create_organization(text) to authenticated;
grant execute on function public.invite_member(uuid, text, text) to authenticated;
grant execute on function public.invite_guest(uuid, text, text) to authenticated;
grant execute on function public.remove_guest(uuid) to authenticated;
grant execute on function public.claim_invitations() to authenticated;

revoke execute on function public.claim_outbox(integer) from public, anon, authenticated;
revoke execute on function public.complete_outbox(bigint, boolean, text) from public, anon, authenticated;
grant execute on function public.claim_outbox(integer) to service_role;
grant execute on function public.complete_outbox(bigint, boolean, text) to service_role;
