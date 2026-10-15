-- Sprint 1 · E1 Honorarios por etapa y E2 Horas
-- Etapas con honorario fijo, por hora o mixto; carga de horas; avisos al 80% y al 100%
-- de las horas presupuestadas (una sola vez por umbral).

-- ---------------------------------------------------------------------------
-- Auditoría: nombre de entidad explícito (time_entries → time_entry, no "time_entrie")
-- ---------------------------------------------------------------------------
create or replace function private.audit_row()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_action text := case tg_op when 'INSERT' then 'created' when 'UPDATE' then 'updated' else 'deleted' end;
  v_entity text := coalesce(tg_argv[0], regexp_replace(tg_table_name, 's$', ''));
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

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------

-- Etapa de honorarios de un proyecto.
--   fixed:  honorario = amount
--   hourly: honorario = horas cargadas × hourly_rate
--   mixed:  honorario = amount, más las horas que exceden budget_hours × hourly_rate
create table public.fee_stages (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id) on delete cascade,
  project_id    uuid not null references public.projects (id) on delete cascade,
  name          text not null check (length(btrim(name)) between 2 and 120),
  position      integer not null default 0,
  kind          text not null default 'fixed' check (kind in ('fixed', 'hourly', 'mixed')),
  currency      text not null default 'USD' check (currency in ('ARS', 'USD')),
  amount        numeric(14, 2) check (amount >= 0),
  hourly_rate   numeric(12, 2) check (hourly_rate >= 0),
  budget_hours  numeric(8, 2) check (budget_hours >= 0),
  alert_80_at   timestamptz,
  alert_100_at  timestamptz,
  created_by    uuid not null references auth.users (id),
  created_at    timestamptz not null default now(),
  constraint fee_stages_kind_fields check (
    (kind = 'fixed'  and amount is not null) or
    (kind = 'hourly' and hourly_rate is not null) or
    (kind = 'mixed'  and amount is not null and hourly_rate is not null)
  )
);
create index fee_stages_org_id_idx on public.fee_stages (org_id);
create index fee_stages_project_id_idx on public.fee_stages (project_id, position);

-- Horas cargadas por una persona en una etapa.
create table public.time_entries (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete cascade,
  project_id  uuid not null references public.projects (id) on delete cascade,
  stage_id    uuid not null references public.fee_stages (id) on delete restrict,
  user_id     uuid not null references auth.users (id),
  work_date   date not null default current_date,
  hours       numeric(4, 2) not null check (hours > 0 and hours <= 24),
  note        text check (length(note) <= 500),
  created_at  timestamptz not null default now()
);
create index time_entries_org_id_idx on public.time_entries (org_id);
create index time_entries_stage_id_idx on public.time_entries (stage_id);
create index time_entries_user_date_idx on public.time_entries (user_id, work_date desc);

-- org_id y project_id se toman siempre del padre: no se pueden falsear desde la app.
create or replace function private.fee_stage_fill_ids()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  select p.org_id into new.org_id from public.projects p where p.id = new.project_id;
  if new.org_id is null then
    raise exception 'Proyecto inexistente' using errcode = '23503';
  end if;
  return new;
end;
$$;

create or replace function private.time_entry_fill_ids()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  select s.org_id, s.project_id into new.org_id, new.project_id
  from public.fee_stages s where s.id = new.stage_id;
  if new.org_id is null then
    raise exception 'Etapa inexistente' using errcode = '23503';
  end if;
  return new;
end;
$$;

create trigger fee_stages_fill_ids before insert or update of project_id on public.fee_stages
for each row execute function private.fee_stage_fill_ids();
create trigger time_entries_fill_ids before insert or update of stage_id on public.time_entries
for each row execute function private.time_entry_fill_ids();

create trigger fee_stages_audit after insert or update or delete on public.fee_stages
for each row execute function private.audit_row('fee_stage');
create trigger time_entries_audit after insert or update or delete on public.time_entries
for each row execute function private.audit_row('time_entry');

-- ---------------------------------------------------------------------------
-- Avisos de horas: al pasar el 80% y el 100% de lo presupuestado, una sola vez
-- ---------------------------------------------------------------------------
create or replace function private.check_hours_alerts(p_stage_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_stage public.fee_stages%rowtype;
  v_project_name text;
  v_used numeric;
  v_threshold integer;
  v_event bigint;
begin
  -- Bloquea la etapa: dos cargas simultáneas no pueden mandar el mismo aviso dos veces.
  select * into v_stage from public.fee_stages where id = p_stage_id for update;
  if not found or coalesce(v_stage.budget_hours, 0) = 0 then
    return;
  end if;

  select coalesce(sum(hours), 0) into v_used from public.time_entries where stage_id = p_stage_id;

  foreach v_threshold in array array[80, 100] loop
    if v_used >= v_stage.budget_hours * v_threshold / 100.0
       and ((v_threshold = 80 and v_stage.alert_80_at is null)
         or (v_threshold = 100 and v_stage.alert_100_at is null)) then

      if v_threshold = 80 then
        update public.fee_stages set alert_80_at = now() where id = p_stage_id;
      else
        update public.fee_stages set alert_100_at = now() where id = p_stage_id;
      end if;

      select name into v_project_name from public.projects where id = v_stage.project_id;

      v_event := private.log_event(v_stage.org_id, 'stage.hours_' || v_threshold, 'fee_stage', p_stage_id,
        jsonb_build_object('project_id', v_stage.project_id, 'stage_name', v_stage.name,
                           'used', v_used, 'budget', v_stage.budget_hours));

      insert into public.outbox (org_id, event_id, kind, to_email, payload)
      select v_stage.org_id, v_event, 'hours_alert', lower(u.email),
             jsonb_build_object('project_name', v_project_name, 'project_id', v_stage.project_id,
                                'stage_name', v_stage.name, 'threshold', v_threshold,
                                'used', v_used, 'budget', v_stage.budget_hours)
      from public.memberships m
      join auth.users u on u.id = m.user_id
      where m.org_id = v_stage.org_id and m.role = 'owner';
    end if;
  end loop;
end;
$$;

create or replace function private.time_entry_after_change()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if tg_op <> 'DELETE' then
    perform private.check_hours_alerts(new.stage_id);
  end if;
  return null;
end;
$$;

create trigger time_entries_alerts after insert or update on public.time_entries
for each row execute function private.time_entry_after_change();

-- Si cambian las horas presupuestadas, se revisan los umbrales con el nuevo valor.
create or replace function private.fee_stage_after_budget()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  perform private.check_hours_alerts(new.id);
  return null;
end;
$$;

create trigger fee_stages_budget_alerts after update of budget_hours on public.fee_stages
for each row when (old.budget_hours is distinct from new.budget_hours)
execute function private.fee_stage_after_budget();

-- ---------------------------------------------------------------------------
-- Resumen por etapa: horas usadas y honorario calculado (respeta RLS de quien consulta)
-- ---------------------------------------------------------------------------
create view public.fee_stage_summary
with (security_invoker = true) as
select
  s.id, s.org_id, s.project_id, s.name, s.position, s.kind, s.currency,
  s.amount, s.hourly_rate, s.budget_hours, s.alert_80_at, s.alert_100_at, s.created_at,
  coalesce(h.hours, 0)::numeric(10, 2) as hours_used,
  (case s.kind
     when 'fixed'  then s.amount
     when 'hourly' then round(coalesce(h.hours, 0) * s.hourly_rate, 2)
     else s.amount + round(greatest(coalesce(h.hours, 0) - coalesce(s.budget_hours, 0), 0)
                           * s.hourly_rate, 2)
   end)::numeric(14, 2) as fee_amount,
  case when s.budget_hours > 0
       then round(100 * coalesce(h.hours, 0) / s.budget_hours, 1) end as budget_pct
from public.fee_stages s
left join (
  select stage_id, sum(hours) as hours from public.time_entries group by stage_id
) h on h.stage_id = s.id;

-- ---------------------------------------------------------------------------
-- Seguridad por fila
-- ---------------------------------------------------------------------------
alter table public.fee_stages   enable row level security;
alter table public.time_entries enable row level security;

-- Etapas: las ven los miembros; las crea, edita y borra el dueño. Los invitados nada.
create policy fee_stages_select on public.fee_stages
for select to authenticated
using ((select private.is_org_member(org_id)));

create policy fee_stages_insert on public.fee_stages
for insert to authenticated
with check ((select private.is_org_owner(org_id)) and created_by = (select auth.uid()));

create policy fee_stages_update on public.fee_stages
for update to authenticated
using ((select private.is_org_owner(org_id)))
with check ((select private.is_org_owner(org_id)));

create policy fee_stages_delete on public.fee_stages
for delete to authenticated
using ((select private.is_org_owner(org_id)));

-- Horas: las ven los miembros; cada uno carga, corrige y borra las suyas; el dueño puede borrar cualquiera.
create policy time_entries_select on public.time_entries
for select to authenticated
using ((select private.is_org_member(org_id)));

create policy time_entries_insert on public.time_entries
for insert to authenticated
with check ((select private.is_org_member(org_id)) and user_id = (select auth.uid()));

create policy time_entries_update on public.time_entries
for update to authenticated
using (user_id = (select auth.uid()) and (select private.is_org_member(org_id)))
with check (user_id = (select auth.uid()) and (select private.is_org_member(org_id)));

create policy time_entries_delete on public.time_entries
for delete to authenticated
using ((user_id = (select auth.uid()) and (select private.is_org_member(org_id)))
       or (select private.is_org_owner(org_id)));

revoke all on public.fee_stages, public.time_entries, public.fee_stage_summary from anon;
-- Los avisos los marca el sistema, no la app: el dueño edita solo estas columnas.
-- (Un revoke por columna no alcanza si el permiso es de tabla, por eso se reemplaza.)
revoke update on public.fee_stages from authenticated;
grant update (name, position, kind, currency, amount, hourly_rate, budget_hours)
  on public.fee_stages to authenticated;
revoke update on public.time_entries from authenticated;
grant update (stage_id, work_date, hours, note) on public.time_entries to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: plantilla de etapas argentina
-- ---------------------------------------------------------------------------
create or replace function public.apply_fee_template(p_project_id uuid, p_currency text default 'USD')
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  v_project public.projects%rowtype;
  v_count integer;
begin
  select * into v_project from public.projects where id = p_project_id;
  if not found or not private.is_org_owner(v_project.org_id) then
    raise exception 'Solo el dueño del estudio puede cargar honorarios' using errcode = '42501';
  end if;
  if p_currency not in ('ARS', 'USD') then
    raise exception 'Moneda inválida: %', p_currency using errcode = '22023';
  end if;
  if exists (select 1 from public.fee_stages where project_id = p_project_id) then
    return 0;
  end if;

  insert into public.fee_stages (org_id, project_id, name, position, kind, currency, amount, created_by)
  select v_project.org_id, p_project_id, t.name, t.pos, 'fixed', p_currency, 0, (select auth.uid())
  from (values
    ('Croquis preliminar', 1),
    ('Anteproyecto', 2),
    ('Documentación de proyecto', 3),
    ('Dirección de obra', 4)
  ) as t (name, pos);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.apply_fee_template(uuid, text) from public, anon;
grant execute on function public.apply_fee_template(uuid, text) to authenticated;

revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;
