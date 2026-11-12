-- Finanzas de obra · Sprint 6: presupuesto por ítem
-- Del orden de magnitud a un presupuesto con rubros e ítems. Cada ítem se valoriza con un análisis
-- de precios (el costo se separa en materiales, mano de obra y equipos) o con un precio directo.
-- Un presupuesto se edita solo en borrador. La suma de las partes da el total al centavo: cada
-- parte de cada ítem se redondea a 2 decimales y el total es la suma de esas partes.

-- ---------------------------------------------------------------------------
-- Cabecera
-- ---------------------------------------------------------------------------
-- Tipo de cambio del presupuesto (pesos por dólar), para valorizar insumos en otra moneda. Se
-- propone el último oficial cargado y se puede cambiar mientras está en borrador.
alter table public.budgets
  add column exchange_rate numeric(14, 4) check (exchange_rate > 0),
  add constraint budgets_item_fields check (
    level = 'parametric' or (covered_m2 is not null and semicovered_m2 is not null and semicovered_factor is not null));

-- ---------------------------------------------------------------------------
-- Rubros e ítems
-- ---------------------------------------------------------------------------
create table public.budget_chapters (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations (id) on delete cascade,
  budget_id  uuid not null references public.budgets (id) on delete cascade,
  name       text not null check (length(btrim(name)) between 2 and 80),
  position   integer not null default 0,
  unique (budget_id, name)
);
create index budget_chapters_budget_idx on public.budget_chapters (budget_id, position);

create table public.budget_items (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations (id) on delete cascade,
  budget_id        uuid not null references public.budgets (id) on delete cascade,
  -- cascade: al borrar el presupuesto entero se van rubros e ítems. Borrar un rubro con ítems
  -- desde la app lo frena el trigger de rubros.
  chapter_id       uuid not null references public.budget_chapters (id) on delete cascade,
  position         integer not null default 0,
  description      text not null check (length(btrim(description)) between 2 and 300),
  unit             text not null check (length(btrim(unit)) between 1 and 20),
  quantity         numeric(14, 4) not null check (quantity > 0),
  -- De dónde sale la cantidad: a mano en R1; del modelo (ifc) o asistida (ai) más adelante.
  quantity_source  text not null default 'manual' check (quantity_source in ('manual', 'ifc', 'ai')),
  -- Se valoriza con un análisis de precios o con un precio directo (en la moneda del presupuesto).
  analysis_id      uuid references public.unit_analyses (id) on delete restrict,
  unit_price       numeric(14, 4) check (unit_price > 0),
  -- A qué parte del costo va un precio directo.
  direct_class     text check (direct_class in ('materials', 'labor', 'equipment', 'subcontract', 'other')),
  -- Subcontratado: todo el costo del ítem va a subcontratos.
  is_subcontract   boolean not null default false,
  created_by       uuid not null references auth.users (id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint budget_items_pricing check (
    (analysis_id is not null and unit_price is null and direct_class is null) or
    (analysis_id is null and unit_price is not null and direct_class is not null))
);
create index budget_items_budget_idx on public.budget_items (budget_id, chapter_id, position);
create index budget_items_analysis_idx on public.budget_items (analysis_id);
create index budget_items_chapter_idx on public.budget_items (chapter_id);

-- Solo se edita un presupuesto en borrador, y nunca uno paramétrico.
create or replace function private.assert_budget_editable(p_budget_id uuid)
returns public.budgets
language plpgsql security definer
set search_path = ''
as $$
declare
  v public.budgets%rowtype;
begin
  select * into v from public.budgets where id = p_budget_id;
  if not found then
    raise exception 'El presupuesto no existe' using errcode = '22023';
  end if;
  if v.level = 'parametric' then
    raise exception 'Una estimación paramétrica no tiene rubros ni ítems' using errcode = '22023';
  end if;
  if v.status <> 'draft' then
    raise exception 'El presupuesto ya no está en borrador: no se puede modificar' using errcode = '22023';
  end if;
  return v;
end;
$$;

create or replace function private.budget_chapter_before_write()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v public.budgets%rowtype;
begin
  if tg_op = 'DELETE' then
    -- Se está borrando el presupuesto (o el proyecto) entero: se van sus rubros.
    if not exists (select 1 from public.budgets b where b.id = old.budget_id) then
      return old;
    end if;
    perform private.assert_budget_editable(old.budget_id);
    if exists (select 1 from public.budget_items i where i.chapter_id = old.id) then
      raise exception 'El rubro tiene ítems: borralos o pasalos a otro rubro antes' using errcode = '23503';
    end if;
    return old;
  end if;
  v := private.assert_budget_editable(new.budget_id);
  if tg_op = 'UPDATE' and new.budget_id <> old.budget_id then
    raise exception 'Un rubro no cambia de presupuesto' using errcode = '22023';
  end if;
  new.org_id := v.org_id;
  new.name := btrim(new.name);
  return new;
end;
$$;
create trigger budget_chapters_before_write before insert or update or delete on public.budget_chapters
for each row execute function private.budget_chapter_before_write();

create or replace function private.budget_item_before_write()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v public.budgets%rowtype;
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from public.budgets b where b.id = old.budget_id) then
      return old;
    end if;
    -- Rubro borrado en cascada: el trigger del rubro ya decidió.
    if not exists (select 1 from public.budget_chapters c where c.id = old.chapter_id) then
      return old;
    end if;
    perform private.assert_budget_editable(old.budget_id);
    return old;
  end if;
  v := private.assert_budget_editable(new.budget_id);
  if tg_op = 'UPDATE' and new.budget_id <> old.budget_id then
    raise exception 'Un ítem no cambia de presupuesto' using errcode = '22023';
  end if;
  new.org_id := v.org_id;
  if not exists (select 1 from public.budget_chapters c where c.id = new.chapter_id and c.budget_id = new.budget_id) then
    raise exception 'El rubro no es de este presupuesto' using errcode = '23514';
  end if;
  if new.analysis_id is not null and not exists (
    select 1 from public.unit_analyses a where a.id = new.analysis_id and a.org_id = v.org_id) then
    raise exception 'El análisis de precios no es de esta organización' using errcode = '23514';
  end if;
  new.description := btrim(new.description);
  new.unit := btrim(new.unit);
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  return new;
end;
$$;
create trigger budget_items_before_write before insert or update or delete on public.budget_items
for each row execute function private.budget_item_before_write();

-- ---------------------------------------------------------------------------
-- Costos
-- ---------------------------------------------------------------------------
-- Costo de cada ítem en la moneda del presupuesto, separado en partes. Las partes de un análisis
-- en otra moneda se pasan con el tipo de cambio del presupuesto; sin tipo de cambio, el ítem no
-- se valoriza y se avisa (missing_rate).
create view public.budget_item_costs
with (security_invoker = true) as
with apu as (
  select
    i.id as item_id,
    sum(c.materials * f.factor) as materials,
    sum(c.labor * f.factor) as labor,
    sum(c.equipment * f.factor) as equipment,
    coalesce(sum(c.unpriced_components), 0)::integer as unpriced_components,
    bool_or(f.factor is null) as missing_rate
  from public.budget_items i
  join public.budgets b on b.id = i.budget_id
  join public.unit_analysis_costs c on c.analysis_id = i.analysis_id
  cross join lateral (
    select case
      when c.currency = b.currency then 1::numeric
      when b.currency = 'ARS' and c.currency = 'USD' then b.exchange_rate
      when b.currency = 'USD' and c.currency = 'ARS' then 1 / b.exchange_rate
    end as factor
  ) f
  where i.analysis_id is not null
  group by i.id
),
unit_parts as (
  select
    i.id, i.org_id, i.budget_id, i.chapter_id, i.position, i.quantity, i.analysis_id, i.is_subcontract,
    coalesce(a.unpriced_components, 0) as unpriced_components,
    coalesce(a.missing_rate, false) as missing_rate,
    -- Por unidad, antes de multiplicar por la cantidad.
    case when i.analysis_id is null then case when i.direct_class = 'materials' then i.unit_price else 0 end
         else coalesce(a.materials, 0) end as u_materials,
    case when i.analysis_id is null then case when i.direct_class = 'labor' then i.unit_price else 0 end
         else coalesce(a.labor, 0) end as u_labor,
    case when i.analysis_id is null then case when i.direct_class = 'equipment' then i.unit_price else 0 end
         else coalesce(a.equipment, 0) end as u_equipment,
    case when i.analysis_id is null then case when i.direct_class = 'subcontract' then i.unit_price else 0 end
         else 0 end as u_subcontract,
    case when i.analysis_id is null then case when i.direct_class = 'other' then i.unit_price else 0 end
         else 0 end as u_other
  from public.budget_items i
  left join apu a on a.item_id = i.id
),
lines as (
  select
    p.*,
    -- Un ítem sin tipo de cambio no suma (se avisa). Subcontratado: todo va a subcontratos.
    case when p.missing_rate then 0 else round(p.quantity * p.u_materials, 2) end as l_materials,
    case when p.missing_rate then 0 else round(p.quantity * p.u_labor, 2) end as l_labor,
    case when p.missing_rate then 0 else round(p.quantity * p.u_equipment, 2) end as l_equipment,
    case when p.missing_rate then 0 else round(p.quantity * p.u_subcontract, 2) end as l_subcontract,
    case when p.missing_rate then 0 else round(p.quantity * p.u_other, 2) end as l_other
  from unit_parts p
)
select
  l.id as item_id, l.org_id, l.budget_id, l.chapter_id, l.position,
  (case when l.is_subcontract then 0 else l.l_materials end)::numeric(14, 2) as materials,
  (case when l.is_subcontract then 0 else l.l_labor end)::numeric(14, 2) as labor,
  (case when l.is_subcontract then 0 else l.l_equipment end)::numeric(14, 2) as equipment,
  (case when l.is_subcontract then l.l_materials + l.l_labor + l.l_equipment + l.l_subcontract + l.l_other
        else l.l_subcontract end)::numeric(14, 2) as subcontract,
  (case when l.is_subcontract then 0 else l.l_other end)::numeric(14, 2) as other,
  (l.l_materials + l.l_labor + l.l_equipment + l.l_subcontract + l.l_other)::numeric(14, 2) as total,
  l.unpriced_components,
  l.missing_rate
from lines l;

-- budget_totals suma los presupuestos por rubros e ítems. Se rehace junto con la vista que la usa.
drop view public.latest_budget_totals;
drop view public.budget_totals;

create view public.budget_totals
with (security_invoker = true) as
with items as (
  select
    ic.budget_id,
    sum(ic.materials) as materials, sum(ic.labor) as labor, sum(ic.equipment) as equipment,
    sum(ic.subcontract) as subcontract, sum(ic.other) as other, sum(ic.total) as total,
    count(*)::integer as items,
    count(*) filter (where ic.unpriced_components > 0)::integer as items_unpriced,
    count(*) filter (where ic.missing_rate)::integer as items_missing_rate
  from public.budget_item_costs ic
  group by ic.budget_id
)
select
  b.id as budget_id, b.org_id, b.project_id, b.number, b.level, b.status, b.currency,
  b.covered_m2 + b.semicovered_m2 * b.semicovered_factor as weighted_m2,
  (case when b.level = 'parametric'
        then round((b.covered_m2 + b.semicovered_m2 * b.semicovered_factor)
                   * b.reference_cost_m2 * b.typology_coef * b.quality_coef, 2)
        else coalesce(i.total, 0) end)::numeric(14, 2) as total,
  (case when b.level = 'parametric'
        then round(b.reference_cost_m2 * b.typology_coef * b.quality_coef, 2)
        else round(coalesce(i.total, 0) / nullif(b.covered_m2 + b.semicovered_m2 * b.semicovered_factor, 0), 2)
   end)::numeric(14, 2) as cost_per_m2,
  -- Desglose del costo directo (solo por rubros e ítems).
  i.materials::numeric(14, 2) as materials,
  i.labor::numeric(14, 2) as labor,
  i.equipment::numeric(14, 2) as equipment,
  i.subcontract::numeric(14, 2) as subcontract,
  i.other::numeric(14, 2) as other,
  coalesce(i.items, 0) as items,
  coalesce(i.items_unpriced, 0) as items_unpriced,
  coalesce(i.items_missing_rate, 0) as items_missing_rate
from public.budgets b
left join items i on i.budget_id = b.id;

create view public.latest_budget_totals
with (security_invoker = true) as
select distinct on (bt.project_id)
  bt.budget_id, bt.org_id, bt.project_id, bt.number, bt.level, bt.status, bt.currency,
  bt.weighted_m2, bt.total, bt.cost_per_m2
from public.budget_totals bt
order by bt.project_id, bt.number desc;

-- ---------------------------------------------------------------------------
-- Seguridad por fila
-- ---------------------------------------------------------------------------
alter table public.budget_chapters enable row level security;
alter table public.budget_items enable row level security;

create policy budget_chapters_select on public.budget_chapters
for select to authenticated using ((select private.is_org_member(org_id)));
create policy budget_chapters_insert on public.budget_chapters
for insert to authenticated
with check ((select private.is_org_member(org_id)) and (select private.has_feature(org_id, 'works')));
create policy budget_chapters_update on public.budget_chapters
for update to authenticated
using ((select private.is_org_member(org_id))) with check ((select private.is_org_member(org_id)));
create policy budget_chapters_delete on public.budget_chapters
for delete to authenticated using ((select private.is_org_member(org_id)));

create policy budget_items_select on public.budget_items
for select to authenticated using ((select private.is_org_member(org_id)));
create policy budget_items_insert on public.budget_items
for insert to authenticated
with check ((select private.is_org_member(org_id)) and (select private.has_feature(org_id, 'works'))
            and created_by = (select auth.uid()));
create policy budget_items_update on public.budget_items
for update to authenticated
using ((select private.is_org_member(org_id))) with check ((select private.is_org_member(org_id)));
create policy budget_items_delete on public.budget_items
for delete to authenticated using ((select private.is_org_member(org_id)));

revoke all on public.budget_chapters, public.budget_items, public.budget_item_costs, public.budget_totals,
  public.latest_budget_totals from anon;
revoke update on public.budget_chapters, public.budget_items from authenticated;
grant update (name, position) on public.budget_chapters to authenticated;
grant update (chapter_id, position, description, unit, quantity, analysis_id, unit_price, direct_class, is_subcontract)
  on public.budget_items to authenticated;
grant select on public.budget_item_costs, public.budget_totals, public.latest_budget_totals to authenticated;

-- ---------------------------------------------------------------------------
-- RPC
-- ---------------------------------------------------------------------------
-- Plantilla de rubros típica. Es orientativa: los rubros se renombran, se agregan y se borran.
create or replace function private.chapter_template()
returns text[]
language sql immutable
set search_path = ''
as $$
  select array['Trabajos preliminares', 'Movimiento de suelos', 'Estructura', 'Mampostería', 'Revoques',
               'Contrapisos y carpetas', 'Pisos y zócalos', 'Cubiertas', 'Aislaciones', 'Carpinterías',
               'Instalación sanitaria', 'Instalación eléctrica', 'Instalación de gas', 'Pinturas', 'Varios'];
$$;

-- Nuevo presupuesto por rubros (by_chapter) o por ítem (by_item), con los m² y la moneda de la
-- ficha de obra y el último tipo de cambio oficial cargado.
create or replace function public.create_item_budget(
  p_project_id uuid, p_level text, p_use_template boolean default true, p_notes text default null)
returns table (id uuid, number integer)
language plpgsql security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_work public.works%rowtype;
  v_number integer;
  v_id uuid;
  v_rate numeric;
begin
  if p_level not in ('by_chapter', 'by_item') then
    raise exception 'Nivel de presupuesto inválido' using errcode = '22023';
  end if;
  select * into v_work from public.works where works.project_id = p_project_id;
  if not found then
    if exists (select 1 from public.projects p where p.id = p_project_id and private.is_org_member(p.org_id)) then
      raise exception 'Completá la ficha de obra antes de presupuestar' using errcode = '22023';
    end if;
    raise exception 'No tenés acceso a este proyecto' using errcode = '42501';
  end if;
  if not private.is_org_member(v_work.org_id) then
    raise exception 'No tenés acceso a este proyecto' using errcode = '42501';
  end if;
  if not private.has_feature(v_work.org_id, 'works') then
    raise exception 'Las funciones de obra no están habilitadas para tu organización' using errcode = '42501';
  end if;

  select er.rate into v_rate from public.exchange_rates er
  where er.org_id = v_work.org_id and er.currency = 'USD' and er.source = 'official'
  order by er.rate_date desc limit 1;

  perform 1 from public.projects where projects.id = p_project_id for update;
  select coalesce(max(b.number), 0) + 1 into v_number from public.budgets b where b.project_id = p_project_id;

  insert into public.budgets (org_id, project_id, number, level, currency, covered_m2, semicovered_m2,
                              semicovered_factor, typology, quality, exchange_rate, notes, created_by)
  values (v_work.org_id, p_project_id, v_number, p_level, v_work.currency, v_work.covered_m2, v_work.semicovered_m2,
          0.5, v_work.typology, v_work.quality, v_rate, nullif(btrim(p_notes), ''), (select auth.uid()))
  returning budgets.id into v_id;

  if coalesce(p_use_template, true) then
    insert into public.budget_chapters (budget_id, name, position)
    select v_id, t.name, t.n::integer from unnest(private.chapter_template()) with ordinality as t (name, n);
  end if;

  perform private.log_event(v_work.org_id, 'budget.created', 'budget', v_id,
    jsonb_build_object('project_id', p_project_id, 'number', v_number, 'level', p_level,
                       'currency', v_work.currency));
  return query select v_id, v_number;
end;
$$;

-- Tipo de cambio del presupuesto (solo en borrador).
create or replace function public.set_budget_exchange_rate(p_budget_id uuid, p_rate numeric)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v public.budgets%rowtype;
begin
  select * into v from public.budgets where id = p_budget_id;
  if not found or not private.is_org_member(v.org_id) then
    raise exception 'No tenés acceso a este presupuesto' using errcode = '42501';
  end if;
  perform private.assert_budget_editable(p_budget_id);
  if p_rate is not null and p_rate <= 0 then
    raise exception 'El tipo de cambio tiene que ser mayor que cero' using errcode = '23514';
  end if;
  update public.budgets set exchange_rate = p_rate where id = p_budget_id;
  perform private.log_event(v.org_id, 'budget.exchange_rate_changed', 'budget', p_budget_id,
    jsonb_build_object('before', v.exchange_rate, 'after', p_rate));
end;
$$;

-- Mueve un rubro o un ítem un lugar arriba o abajo dentro de su lista (intercambia posiciones).
create or replace function public.move_budget_row(p_kind text, p_id uuid, p_direction integer)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_budget uuid;
  v_chapter uuid;
  v_ids uuid[];
  v_index integer;
  v_other integer;
begin
  if p_kind = 'chapter' then
    select budget_id into v_budget from public.budget_chapters where id = p_id;
  elsif p_kind = 'item' then
    select budget_id, chapter_id into v_budget, v_chapter from public.budget_items where id = p_id;
  else
    raise exception 'Tipo inválido' using errcode = '22023';
  end if;
  if v_budget is null or not exists (
    select 1 from public.budgets b where b.id = v_budget and private.is_org_member(b.org_id)) then
    raise exception 'No tenés acceso a este presupuesto' using errcode = '42501';
  end if;
  perform private.assert_budget_editable(v_budget);

  -- Se renumera la lista entera (1, 2, 3…) en el orden actual y se intercambia con el vecino.
  if p_kind = 'chapter' then
    select array_agg(c.id order by c.position, c.name) into v_ids from public.budget_chapters c where c.budget_id = v_budget;
  else
    select array_agg(i.id order by i.position, i.created_at) into v_ids from public.budget_items i where i.chapter_id = v_chapter;
  end if;
  v_index := array_position(v_ids, p_id);
  v_other := v_index + sign(p_direction)::integer;
  if v_other < 1 or v_other > cardinality(v_ids) then
    return;
  end if;
  v_ids[v_index] := v_ids[v_other];
  v_ids[v_other] := p_id;

  if p_kind = 'chapter' then
    update public.budget_chapters c set position = t.n from unnest(v_ids) with ordinality t (id, n) where c.id = t.id;
  else
    update public.budget_items i set position = t.n from unnest(v_ids) with ordinality t (id, n) where i.id = t.id;
  end if;
end;
$$;

revoke execute on function public.create_item_budget(uuid, text, boolean, text) from public, anon;
revoke execute on function public.set_budget_exchange_rate(uuid, numeric) from public, anon;
revoke execute on function public.move_budget_row(text, uuid, integer) from public, anon;
grant execute on function public.create_item_budget(uuid, text, boolean, text) to authenticated;
grant execute on function public.set_budget_exchange_rate(uuid, numeric) to authenticated;
grant execute on function public.move_budget_row(text, uuid, integer) to authenticated;

revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;
