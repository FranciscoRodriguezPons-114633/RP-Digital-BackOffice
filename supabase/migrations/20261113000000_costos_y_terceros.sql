-- Finanzas de obra · Sprint 3: costo interno, rentabilidad y terceros
-- El costo por hora de cada persona (con vigencia) lo ve y lo edita solo el dueño. Con eso,
-- la rentabilidad de cada etapa = honorario ajustado + adicionales aprobados − Σ horas × costo
-- vigente a la fecha de cada hora, separada por moneda y sin convertir. Los terceros
-- (comitentes, proveedores, subcontratistas) son la base de presupuestos, contratos y compras.

-- ---------------------------------------------------------------------------
-- Costo por hora (solo el dueño)
-- ---------------------------------------------------------------------------
create table public.member_costs (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  hourly_cost  numeric(12, 2) not null check (hourly_cost > 0),
  currency     text not null check (currency in ('ARS', 'USD')),
  valid_from   date not null,
  created_by   uuid not null references auth.users (id),
  created_at   timestamptz not null default now(),
  unique (org_id, user_id, valid_from)
);
create index member_costs_lookup_idx on public.member_costs (org_id, user_id, valid_from desc);

-- La persona tiene que ser del estudio.
create or replace function private.member_cost_check()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.memberships m where m.org_id = new.org_id and m.user_id = new.user_id) then
    raise exception 'La persona no es del estudio' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger member_costs_check before insert or update on public.member_costs
for each row execute function private.member_cost_check();

-- Evento por cada cambio, SIN el monto: los miembros leen el registro de eventos.
create or replace function private.member_cost_event()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_row public.member_costs := case when tg_op = 'DELETE' then old else new end;
begin
  perform private.log_event(v_row.org_id,
    'member_cost.' || case tg_op when 'INSERT' then 'created' when 'UPDATE' then 'updated' else 'deleted' end,
    'member_cost', v_row.id,
    jsonb_build_object('user_id', v_row.user_id, 'valid_from', v_row.valid_from));
  return null;
end;
$$;
create trigger member_costs_event after insert or update or delete on public.member_costs
for each row execute function private.member_cost_event();

alter table public.member_costs enable row level security;
create policy member_costs_select on public.member_costs
for select to authenticated using ((select private.is_org_owner(org_id)));
create policy member_costs_insert on public.member_costs
for insert to authenticated
with check ((select private.is_org_owner(org_id)) and created_by = (select auth.uid()));
create policy member_costs_update on public.member_costs
for update to authenticated
using ((select private.is_org_owner(org_id))) with check ((select private.is_org_owner(org_id)));
create policy member_costs_delete on public.member_costs
for delete to authenticated using ((select private.is_org_owner(org_id)));

revoke all on public.member_costs from anon;
revoke update on public.member_costs from authenticated;
grant update (hourly_cost, currency) on public.member_costs to authenticated;

-- ---------------------------------------------------------------------------
-- Rentabilidad por etapa y moneda (a un miembro le devuelve vacío)
-- ---------------------------------------------------------------------------
-- Cada hora usa el costo vigente a su fecha (el último con valid_from <= work_date). El costo
-- de cada carga se redondea al centavo y después se suma, igual que una cuenta a mano.
create view public.stage_profitability
with (security_invoker = true) as
with entry_costs as (
  select te.org_id, te.stage_id, te.user_id, te.hours, c.currency as cost_currency, c.hourly_cost
  from public.time_entries te
  left join lateral (
    select mc.currency, mc.hourly_cost from public.member_costs mc
    where mc.org_id = te.org_id and mc.user_id = te.user_id and mc.valid_from <= te.work_date
    order by mc.valid_from desc limit 1
  ) c on true
),
costs as (
  select stage_id, cost_currency as currency, sum(round(hours * hourly_cost, 2)) as cost, sum(hours) as hours
  from entry_costs where cost_currency is not null
  group by stage_id, cost_currency
),
missing as (
  select stage_id, sum(hours) as hours from entry_costs where cost_currency is null group by stage_id
),
keys as (
  select s.id as stage_id, s.currency from public.fee_stages s
  union
  select stage_id, currency from costs
)
select
  s.org_id, s.project_id, s.id as stage_id, s.name as stage_name, s.position, k.currency,
  (case when k.currency = s.currency then f.total_amount else 0 end)::numeric(14, 2) as income,
  coalesce(c.cost, 0)::numeric(14, 2) as cost,
  ((case when k.currency = s.currency then f.total_amount else 0 end) - coalesce(c.cost, 0))::numeric(14, 2) as profit,
  coalesce(c.hours, 0)::numeric(10, 2) as hours_costed,
  (case when k.currency = s.currency then coalesce(m.hours, 0) else 0 end)::numeric(10, 2) as hours_missing_cost
from keys k
join public.fee_stages s on s.id = k.stage_id
join public.fee_stage_summary f on f.id = s.id
left join costs c on c.stage_id = k.stage_id and c.currency = k.currency
left join missing m on m.stage_id = k.stage_id
where (select private.is_org_owner(s.org_id));

-- Quién tiene horas cargadas sin costo vigente a esa fecha (para avisar, sin asumir cero).
create view public.missing_member_costs
with (security_invoker = true) as
select te.org_id, te.project_id, te.user_id, sum(te.hours)::numeric(10, 2) as hours, min(te.work_date) as first_date
from public.time_entries te
where (select private.is_org_owner(te.org_id))
  and not exists (
    select 1 from public.member_costs mc
    where mc.org_id = te.org_id and mc.user_id = te.user_id and mc.valid_from <= te.work_date)
group by te.org_id, te.project_id, te.user_id;

revoke all on public.stage_profitability, public.missing_member_costs from anon;
grant select on public.stage_profitability, public.missing_member_costs to authenticated;

-- ---------------------------------------------------------------------------
-- Terceros
-- ---------------------------------------------------------------------------
-- CUIT: 11 dígitos y dígito verificador (módulo 11 con pesos 5,4,3,2,7,6,5,4,3,2). Si el
-- resto da 10, AFIP usa 9 (con prefijo 23, 24 o 33): igual que isValidCuit en validation.ts.
create or replace function private.is_valid_cuit(p text)
returns boolean
language plpgsql immutable
set search_path = ''
as $$
declare
  v_weights int[] := array[5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  v_sum int := 0;
  v_check int;
begin
  if p is null or p !~ '^[0-9]{11}$' then
    return false;
  end if;
  for i in 1..10 loop
    v_sum := v_sum + substr(p, i, 1)::int * v_weights[i];
  end loop;
  v_check := 11 - (v_sum % 11);
  if v_check = 11 then v_check := 0; end if;
  if v_check = 10 then v_check := 9; end if;
  return v_check = substr(p, 11, 1)::int;
end;
$$;

create table public.parties (
  id                      uuid primary key default gen_random_uuid(),
  org_id                  uuid not null references public.organizations (id) on delete cascade,
  name                    text not null check (length(btrim(name)) between 2 and 200),
  tax_id                  text check (tax_id is null or private.is_valid_cuit(tax_id)),
  roles                   text[] not null
                          check (cardinality(roles) between 1 and 3
                                 and roles <@ array['client', 'supplier', 'subcontractor']::text[]),
  vat_condition           text check (vat_condition in ('registered', 'monotax', 'exempt', 'final_consumer', 'not_applicable')),
  gross_income_condition  text check (gross_income_condition in ('local', 'multilateral', 'exempt', 'not_registered')),
  email                   text check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 200),
  phone                   text check (length(phone) <= 40),
  address                 text check (length(address) <= 200),
  notes                   text check (length(notes) <= 2000),
  created_by              uuid not null references auth.users (id),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (org_id, tax_id)
);
create index parties_org_name_idx on public.parties (org_id, lower(name));

-- El CUIT se guarda solo con dígitos ("20-12345678-6" → "20123456786").
create or replace function private.party_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.tax_id := nullif(regexp_replace(coalesce(new.tax_id, ''), '[^0-9]', '', 'g'), '');
  new.name := btrim(new.name);
  new.email := nullif(lower(btrim(coalesce(new.email, ''))), '');
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  return new;
end;
$$;
create trigger parties_before_write before insert or update on public.parties
for each row execute function private.party_before_write();

create trigger parties_audit after insert or update or delete on public.parties
for each row execute function private.audit_row('party');

alter table public.parties enable row level security;
create policy parties_select on public.parties
for select to authenticated using ((select private.is_org_member(org_id)));
create policy parties_insert on public.parties
for insert to authenticated
with check ((select private.is_org_member(org_id)) and (select private.has_feature(org_id, 'works'))
            and created_by = (select auth.uid()));
create policy parties_update on public.parties
for update to authenticated
using ((select private.is_org_member(org_id)))
with check ((select private.is_org_member(org_id)) and (select private.has_feature(org_id, 'works')));
create policy parties_delete on public.parties
for delete to authenticated using ((select private.is_org_owner(org_id)));

revoke all on public.parties from anon;
revoke update on public.parties from authenticated;
grant update (name, tax_id, roles, vat_condition, gross_income_condition, email, phone, address, notes)
  on public.parties to authenticated;

-- ---------------------------------------------------------------------------
-- Comitente de la obra
-- ---------------------------------------------------------------------------
alter table public.works
  add column client_party_id uuid references public.parties (id) on delete restrict;
create index works_client_party_idx on public.works (client_party_id);

create or replace function private.work_client_check()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.client_party_id is not null and not exists (
    select 1 from public.parties p
    where p.id = new.client_party_id and p.org_id = new.org_id and 'client' = any (p.roles)) then
    raise exception 'El comitente tiene que ser un tercero de la organización con el rol de comitente'
      using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger works_client_check before insert or update of client_party_id on public.works
for each row execute function private.work_client_check();

-- upsert_work suma el comitente (opcional): mismo comportamiento que en el sprint 1.
drop function public.upsert_work(uuid, text, text, text, numeric, numeric, text, text, date, date, text);

create function public.upsert_work(
  p_project_id uuid, p_org_role text, p_address text, p_city text, p_covered_m2 numeric,
  p_semicovered_m2 numeric, p_typology text, p_quality text, p_planned_start date,
  p_planned_end date, p_currency text, p_client_party_id uuid default null)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_project public.projects%rowtype;
  v_old public.works%rowtype;
  v_id uuid;
begin
  select * into v_project from public.projects where id = p_project_id;
  if not found or not private.is_org_member(v_project.org_id) then
    raise exception 'No tenés acceso a este proyecto' using errcode = '42501';
  end if;
  if not private.has_feature(v_project.org_id, 'works') then
    raise exception 'Las funciones de obra no están habilitadas para tu organización' using errcode = '42501';
  end if;

  select * into v_old from public.works where project_id = p_project_id for update;

  insert into public.works (org_id, project_id, org_role, address, city, covered_m2, semicovered_m2,
                            typology, quality, planned_start, planned_end, currency, client_party_id, created_by)
  values (v_project.org_id, p_project_id, p_org_role, nullif(btrim(p_address), ''), nullif(btrim(p_city), ''),
          p_covered_m2, coalesce(p_semicovered_m2, 0), p_typology, p_quality, p_planned_start, p_planned_end,
          coalesce(p_currency, 'USD'), p_client_party_id, (select auth.uid()))
  on conflict (project_id) do update
  set org_role = excluded.org_role, address = excluded.address, city = excluded.city,
      covered_m2 = excluded.covered_m2, semicovered_m2 = excluded.semicovered_m2,
      typology = excluded.typology, quality = excluded.quality, planned_start = excluded.planned_start,
      planned_end = excluded.planned_end, currency = excluded.currency,
      client_party_id = excluded.client_party_id, updated_at = now()
  returning id into v_id;

  if v_old.id is null then
    perform private.log_event(v_project.org_id, 'work.created', 'work', v_id,
      jsonb_build_object('project_id', p_project_id, 'org_role', p_org_role, 'covered_m2', p_covered_m2));
  else
    perform private.log_event(v_project.org_id, 'work.updated', 'work', v_id,
      jsonb_build_object('project_id', p_project_id, 'before', to_jsonb(v_old),
                         'after', (select to_jsonb(w) from public.works w where w.id = v_id)));
  end if;
  return v_id;
end;
$$;

revoke execute on function public.upsert_work(uuid, text, text, text, numeric, numeric, text, text, date, date, text, uuid)
  from public, anon;
grant execute on function public.upsert_work(uuid, text, text, text, numeric, numeric, text, text, date, date, text, uuid)
  to authenticated;

revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;
