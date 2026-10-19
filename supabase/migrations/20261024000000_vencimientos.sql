-- Sprint 5 · E9: vencimientos propios con avisos
-- El estudio carga fechas que no puede pasar (presentación municipal, entrega al cliente,
-- vencimiento de un permiso) con avisos a 30, 15 y 5 días, o los que elija. Un job diario
-- manda cada aviso una sola vez por umbral; si pasan varios umbrales juntos (por ejemplo,
-- el job no corrió unos días) manda uno solo, el más cercano.

create table public.deadlines (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations (id) on delete cascade,
  project_id   uuid references public.projects (id) on delete cascade,   -- null: del estudio
  title        text not null check (length(btrim(title)) between 2 and 160),
  due_date     date not null,
  notify_days  integer[] not null default '{30,15,5}'
               check (cardinality(notify_days) between 1 and 6 and 1 <= all (notify_days) and 365 >= all (notify_days)),
  notes        text check (length(notes) <= 1000),
  done_at      timestamptz,
  done_by      uuid references auth.users (id),
  created_by   uuid not null references auth.users (id),
  created_at   timestamptz not null default now()
);
create index deadlines_org_due_idx on public.deadlines (org_id, due_date) where done_at is null;
create index deadlines_project_idx on public.deadlines (project_id);

-- Un aviso por vencimiento y umbral: la clave única garantiza que no se repita.
create table public.deadline_alerts (
  deadline_id  uuid not null references public.deadlines (id) on delete cascade,
  days_before  integer not null,
  sent_at      timestamptz not null default now(),
  primary key (deadline_id, days_before)
);

alter table public.deadlines enable row level security;
alter table public.deadline_alerts enable row level security;
create policy deadlines_select on public.deadlines
for select to authenticated using ((select private.is_org_member(org_id)));
create policy deadline_alerts_select on public.deadline_alerts
for select to authenticated
using (exists (select 1 from public.deadlines d where d.id = deadline_id));

revoke all on public.deadlines, public.deadline_alerts from anon;
revoke insert, update, delete on public.deadlines, public.deadline_alerts from authenticated;

-- ---------------------------------------------------------------------------
-- RPC
-- ---------------------------------------------------------------------------
create or replace function public.create_deadline(
  p_org_id uuid, p_project_id uuid, p_title text, p_due_date date, p_notify_days integer[] default '{30,15,5}',
  p_notes text default null)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_days integer[];
begin
  if not private.is_org_member(p_org_id) then
    raise exception 'No tenés acceso a este estudio' using errcode = '42501';
  end if;
  if p_project_id is not null
     and not exists (select 1 from public.projects where id = p_project_id and org_id = p_org_id) then
    raise exception 'El proyecto no es de este estudio' using errcode = '42501';
  end if;
  -- Umbrales sin repetir, de mayor a menor.
  select array_agg(d order by d desc) into v_days from (select distinct unnest(p_notify_days) d) x;

  insert into public.deadlines (org_id, project_id, title, due_date, notify_days, notes, created_by)
  values (p_org_id, p_project_id, btrim(p_title), p_due_date, coalesce(v_days, '{30,15,5}'),
          nullif(btrim(p_notes), ''), (select auth.uid()))
  returning id into v_id;

  -- Los umbrales que ya pasaron al crearlo no se avisan: la persona acaba de cargar la fecha.
  insert into public.deadline_alerts (deadline_id, days_before)
  select v_id, d from unnest(coalesce(v_days, '{30,15,5}')) d
  where p_due_date - (now() at time zone 'America/Argentina/Cordoba')::date < d;

  perform private.log_event(p_org_id, 'deadline.created', 'deadline', v_id,
    jsonb_build_object('project_id', p_project_id, 'title', btrim(p_title), 'due_date', p_due_date));
  return v_id;
end;
$$;

create or replace function public.set_deadline_done(p_id uuid, p_done boolean)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_d public.deadlines%rowtype;
begin
  select * into v_d from public.deadlines where id = p_id for update;
  if not found or not private.is_org_member(v_d.org_id) then
    raise exception 'No tenés acceso a este vencimiento' using errcode = '42501';
  end if;
  update public.deadlines
  set done_at = case when p_done then coalesce(done_at, now()) end,
      done_by = case when p_done then coalesce(done_by, (select auth.uid())) end
  where id = p_id;
  perform private.log_event(v_d.org_id, case when p_done then 'deadline.done' else 'deadline.reopened' end,
    'deadline', p_id, jsonb_build_object('project_id', v_d.project_id, 'title', v_d.title, 'due_date', v_d.due_date));
end;
$$;

-- Job diario (Supabase Cron). Devuelve cuántos avisos encoló.
create or replace function public.process_deadline_alerts(
  p_today date default (now() at time zone 'America/Argentina/Cordoba')::date)
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  v_d public.deadlines%rowtype;
  v_due integer;
  v_closest integer;
  v_project_name text;
  v_event bigint;
  v_sent integer := 0;
begin
  for v_d in
    select * from public.deadlines d
    where d.done_at is null and d.due_date >= p_today
      and exists (select 1 from unnest(d.notify_days) t
                  where d.due_date - p_today <= t
                    and not exists (select 1 from public.deadline_alerts a where a.deadline_id = d.id and a.days_before = t))
    for update skip locked
  loop
    v_due := v_d.due_date - p_today;
    -- Se marcan todos los umbrales alcanzados, pero se avisa por el más cercano.
    with marked as (
      insert into public.deadline_alerts (deadline_id, days_before)
      select v_d.id, t from unnest(v_d.notify_days) t where v_due <= t
      on conflict do nothing
      returning days_before
    )
    select min(days_before) into v_closest from marked;
    continue when v_closest is null;

    select name into v_project_name from public.projects where id = v_d.project_id;
    v_event := private.log_event(v_d.org_id, 'deadline.alert', 'deadline', v_d.id,
      jsonb_build_object('project_id', v_d.project_id, 'title', v_d.title, 'due_date', v_d.due_date,
                         'days_left', v_due, 'threshold', v_closest));

    insert into public.outbox (org_id, event_id, kind, to_email, payload)
    select v_d.org_id, v_event, 'deadline_alert', lower(u.email),
           jsonb_build_object('title', v_d.title, 'due_date', v_d.due_date, 'days_left', v_due,
                              'project_name', v_project_name, 'project_id', v_d.project_id)
    from public.memberships m join auth.users u on u.id = m.user_id
    where m.org_id = v_d.org_id and (m.role = 'owner' or m.user_id = v_d.created_by);
    v_sent := v_sent + 1;
  end loop;
  return v_sent;
end;
$$;

revoke execute on function public.create_deadline(uuid, uuid, text, date, integer[], text) from public, anon;
revoke execute on function public.set_deadline_done(uuid, boolean) from public, anon;
revoke execute on function public.process_deadline_alerts(date) from public, anon, authenticated;
grant execute on function public.create_deadline(uuid, uuid, text, date, integer[], text) to authenticated;
grant execute on function public.set_deadline_done(uuid, boolean) to authenticated;
grant execute on function public.process_deadline_alerts(date) to service_role;
