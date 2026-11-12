-- Finanzas de obra · Sprint 1 · F0 (núcleo) y P2 (nivel 1)
-- Tipo de organización (estudio o constructora), funciones en prueba por organización,
-- ficha de obra por proyecto y presupuesto paramétrico (versión 1, nivel paramétrico).
-- Los coeficientes de tipología y calidad son orientativos y editables: los valida un
-- profesional de cómputos antes de la compuerta 1.

-- ---------------------------------------------------------------------------
-- Organización: tipo y funciones en prueba
-- ---------------------------------------------------------------------------
-- `kind` lo cambia el dueño con set_organization_kind; `beta_features` lo carga solo la
-- plataforma por SQL (como platform_admins). La app solo puede actualizar `name`
-- (ver planes_y_cobro: grant update (name)), así que ninguna de las dos se edita desde la API.
alter table public.organizations
  add column kind text not null default 'studio' check (kind in ('studio', 'builder')),
  add column beta_features text[] not null default '{}';

create or replace function private.has_feature(p_org_id uuid, p_feature text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce((select p_feature = any (o.beta_features) from public.organizations o where o.id = p_org_id), false);
$$;

create or replace function public.set_organization_kind(p_org_id uuid, p_kind text)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_old text;
begin
  if not private.is_org_owner(p_org_id) then
    raise exception 'Solo el dueño cambia el tipo de organización' using errcode = '42501';
  end if;
  if p_kind not in ('studio', 'builder') then
    raise exception 'Tipo de organización inválido: %', p_kind using errcode = '22023';
  end if;
  select kind into v_old from public.organizations where id = p_org_id for update;
  if v_old = p_kind then
    return;
  end if;
  update public.organizations set kind = p_kind where id = p_org_id;
  perform private.log_event(p_org_id, 'organization.kind_changed', 'organization', p_org_id,
                            jsonb_build_object('before', v_old, 'after', p_kind));
end;
$$;

-- ---------------------------------------------------------------------------
-- Coeficientes del paramétrico (por organización)
-- ---------------------------------------------------------------------------
create table public.parametric_coefficients (
  org_id      uuid not null references public.organizations (id) on delete cascade,
  dimension   text not null check (dimension in ('typology', 'quality')),
  key         text not null,
  value       numeric(6, 4) not null check (value > 0 and value <= 10),
  updated_at  timestamptz not null default now(),
  primary key (org_id, dimension, key),
  constraint parametric_coefficients_key check (
    (dimension = 'typology' and key in ('single_family', 'multifamily', 'commercial', 'office', 'industrial')) or
    (dimension = 'quality' and key in ('economic', 'standard', 'high', 'premium'))
  )
);

-- Valores orientativos [I]: vivienda unifamiliar y calidad estándar valen 1.
create or replace function private.seed_parametric_coefficients(p_org_id uuid)
returns void
language sql security definer
set search_path = ''
as $$
  insert into public.parametric_coefficients (org_id, dimension, key, value)
  values (p_org_id, 'typology', 'single_family', 1.00),
         (p_org_id, 'typology', 'multifamily', 1.05),
         (p_org_id, 'typology', 'commercial', 0.95),
         (p_org_id, 'typology', 'office', 1.10),
         (p_org_id, 'typology', 'industrial', 0.65),
         (p_org_id, 'quality', 'economic', 0.80),
         (p_org_id, 'quality', 'standard', 1.00),
         (p_org_id, 'quality', 'high', 1.25),
         (p_org_id, 'quality', 'premium', 1.60)
  on conflict do nothing;
$$;

create or replace function private.organization_after_insert()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  perform private.seed_parametric_coefficients(new.id);
  return null;
end;
$$;

create trigger organizations_seed_coefficients after insert on public.organizations
for each row execute function private.organization_after_insert();

-- Las organizaciones que ya existen también los reciben.
do $$ begin perform private.seed_parametric_coefficients(id) from public.organizations; end $$;

alter table public.parametric_coefficients enable row level security;

create policy parametric_coefficients_select on public.parametric_coefficients
for select to authenticated
using ((select private.is_org_member(org_id)));

create policy parametric_coefficients_update on public.parametric_coefficients
for update to authenticated
using ((select private.is_org_owner(org_id)))
with check ((select private.is_org_owner(org_id)));

revoke all on public.parametric_coefficients from anon;
revoke insert, update, delete on public.parametric_coefficients from authenticated;
grant update (value) on public.parametric_coefficients to authenticated;

create trigger parametric_coefficients_audit after update on public.parametric_coefficients
for each row execute function private.audit_row('parametric_coefficient');

-- ---------------------------------------------------------------------------
-- Ficha de obra: una por proyecto
-- ---------------------------------------------------------------------------
-- org_role: qué papel cumple la organización en la obra.
--   builder:        construye (constructora o estudio que ejecuta).
--   works_director: dirige la obra que construye otro.
--   administrator:  administra la obra por cuenta del comitente.
create table public.works (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations (id) on delete cascade,
  project_id      uuid not null unique references public.projects (id) on delete cascade,
  org_role        text not null check (org_role in ('builder', 'works_director', 'administrator')),
  address         text check (length(address) <= 200),
  city            text check (length(city) <= 120),
  covered_m2      numeric(10, 2) not null check (covered_m2 > 0),
  semicovered_m2  numeric(10, 2) not null default 0 check (semicovered_m2 >= 0),
  typology        text not null check (typology in ('single_family', 'multifamily', 'commercial', 'office', 'industrial')),
  quality         text not null check (quality in ('economic', 'standard', 'high', 'premium')),
  planned_start   date,
  planned_end     date,
  currency        text not null default 'USD' check (currency in ('ARS', 'USD')),
  created_by      uuid not null references auth.users (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint works_dates check (planned_start is null or planned_end is null or planned_end >= planned_start)
);
create index works_org_id_idx on public.works (org_id);

alter table public.works enable row level security;

-- Solo miembros: los invitados (cliente, contratista) no ven la ficha.
create policy works_select on public.works
for select to authenticated
using ((select private.is_org_member(org_id)));

revoke all on public.works from anon;
revoke insert, update, delete on public.works from authenticated;

create or replace function public.upsert_work(
  p_project_id uuid, p_org_role text, p_address text, p_city text, p_covered_m2 numeric,
  p_semicovered_m2 numeric, p_typology text, p_quality text, p_planned_start date,
  p_planned_end date, p_currency text)
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
                            typology, quality, planned_start, planned_end, currency, created_by)
  values (v_project.org_id, p_project_id, p_org_role, nullif(btrim(p_address), ''), nullif(btrim(p_city), ''),
          p_covered_m2, coalesce(p_semicovered_m2, 0), p_typology, p_quality, p_planned_start, p_planned_end,
          coalesce(p_currency, 'USD'), (select auth.uid()))
  on conflict (project_id) do update
  set org_role = excluded.org_role, address = excluded.address, city = excluded.city,
      covered_m2 = excluded.covered_m2, semicovered_m2 = excluded.semicovered_m2,
      typology = excluded.typology, quality = excluded.quality, planned_start = excluded.planned_start,
      planned_end = excluded.planned_end, currency = excluded.currency, updated_at = now()
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

-- ---------------------------------------------------------------------------
-- Presupuestos (cabecera). En este sprint, solo el nivel paramétrico.
-- ---------------------------------------------------------------------------
-- El paramétrico guarda una copia de los datos con que se calculó (m², coeficientes y costo
-- de referencia con su fecha y origen): si después cambia la ficha o un coeficiente, la
-- versión ya emitida no se mueve.
create table public.budgets (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations (id) on delete cascade,
  project_id          uuid not null references public.projects (id) on delete cascade,
  number              integer not null check (number > 0),
  level               text not null check (level in ('parametric', 'by_chapter', 'by_item')),
  status              text not null default 'draft'
                      check (status in ('draft', 'sent', 'approved', 'rejected', 'contractual', 'superseded', 'void')),
  currency            text not null check (currency in ('ARS', 'USD')),
  covered_m2          numeric(10, 2) check (covered_m2 > 0),
  semicovered_m2      numeric(10, 2) check (semicovered_m2 >= 0),
  semicovered_factor  numeric(4, 3) check (semicovered_factor >= 0 and semicovered_factor <= 1),
  typology            text,
  typology_coef       numeric(6, 4) check (typology_coef > 0),
  quality             text,
  quality_coef        numeric(6, 4) check (quality_coef > 0),
  reference_cost_m2   numeric(14, 2) check (reference_cost_m2 > 0),
  reference_date      date,
  reference_source    text check (length(btrim(reference_source)) between 2 and 200),
  notes               text check (length(notes) <= 2000),
  created_by          uuid not null references auth.users (id),
  created_at          timestamptz not null default now(),
  unique (project_id, number),
  constraint budgets_parametric_fields check (
    level <> 'parametric' or (
      covered_m2 is not null and semicovered_m2 is not null and semicovered_factor is not null and
      typology is not null and typology_coef is not null and quality is not null and quality_coef is not null and
      reference_cost_m2 is not null and reference_date is not null and reference_source is not null
    )
  )
);
create index budgets_org_id_idx on public.budgets (org_id);
create index budgets_project_idx on public.budgets (project_id, number desc);

alter table public.budgets enable row level security;

create policy budgets_select on public.budgets
for select to authenticated
using ((select private.is_org_member(org_id)));

revoke all on public.budgets from anon;
revoke insert, update, delete on public.budgets from authenticated;

-- Total = (m² cubiertos + m² semicubiertos × factor) × costo de referencia × coef. tipología × coef. calidad,
-- redondeado a 2 decimales. El costo por m² es sobre la superficie ponderada.
create view public.budget_totals
with (security_invoker = true) as
select
  b.id as budget_id,
  b.org_id,
  b.project_id,
  b.number,
  b.level,
  b.status,
  b.currency,
  b.covered_m2 + b.semicovered_m2 * b.semicovered_factor as weighted_m2,
  round((b.covered_m2 + b.semicovered_m2 * b.semicovered_factor)
        * b.reference_cost_m2 * b.typology_coef * b.quality_coef, 2) as total,
  round(b.reference_cost_m2 * b.typology_coef * b.quality_coef, 2) as cost_per_m2
from public.budgets b
where b.level = 'parametric';

grant select on public.budget_totals to authenticated;

create or replace function public.create_parametric_budget(
  p_project_id uuid, p_reference_cost_m2 numeric, p_reference_date date, p_reference_source text,
  p_semicovered_factor numeric default 0.5, p_typology_coef numeric default null,
  p_quality_coef numeric default null, p_notes text default null)
returns table (id uuid, number integer)
language plpgsql security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_work public.works%rowtype;
  v_typology_coef numeric;
  v_quality_coef numeric;
  v_number integer;
  v_id uuid;
  v_total numeric;
begin
  select * into v_work from public.works where works.project_id = p_project_id;
  if not found then
    if exists (select 1 from public.projects p where p.id = p_project_id and private.is_org_member(p.org_id)) then
      raise exception 'Completá la ficha de obra antes de estimar' using errcode = '22023';
    end if;
    raise exception 'No tenés acceso a este proyecto' using errcode = '42501';
  end if;
  if not private.is_org_member(v_work.org_id) then
    raise exception 'No tenés acceso a este proyecto' using errcode = '42501';
  end if;
  if not private.has_feature(v_work.org_id, 'works') then
    raise exception 'Las funciones de obra no están habilitadas para tu organización' using errcode = '42501';
  end if;

  v_typology_coef := coalesce(p_typology_coef, (select c.value from public.parametric_coefficients c
    where c.org_id = v_work.org_id and c.dimension = 'typology' and c.key = v_work.typology));
  v_quality_coef := coalesce(p_quality_coef, (select c.value from public.parametric_coefficients c
    where c.org_id = v_work.org_id and c.dimension = 'quality' and c.key = v_work.quality));

  -- Numeración correlativa por proyecto, sin huecos por carreras entre dos personas.
  perform 1 from public.projects where projects.id = p_project_id for update;
  select coalesce(max(b.number), 0) + 1 into v_number from public.budgets b where b.project_id = p_project_id;

  insert into public.budgets (org_id, project_id, number, level, currency, covered_m2, semicovered_m2,
                              semicovered_factor, typology, typology_coef, quality, quality_coef,
                              reference_cost_m2, reference_date, reference_source, notes, created_by)
  values (v_work.org_id, p_project_id, v_number, 'parametric', v_work.currency, v_work.covered_m2,
          v_work.semicovered_m2, coalesce(p_semicovered_factor, 0.5), v_work.typology, v_typology_coef,
          v_work.quality, v_quality_coef, p_reference_cost_m2, p_reference_date, btrim(p_reference_source),
          nullif(btrim(p_notes), ''), (select auth.uid()))
  returning budgets.id into v_id;

  select t.total into v_total from public.budget_totals t where t.budget_id = v_id;
  perform private.log_event(v_work.org_id, 'budget.created', 'budget', v_id,
    jsonb_build_object('project_id', p_project_id, 'number', v_number, 'level', 'parametric',
                       'total', v_total, 'currency', v_work.currency));
  return query select v_id, v_number;
end;
$$;
