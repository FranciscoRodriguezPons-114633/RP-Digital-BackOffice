-- Finanzas de obra · Sprint 8: versiones congeladas, comparación y ajuste por índice
-- El presupuesto acompaña la vida del proyecto sin perder la historia:
--   · Al emitirlo (borrador → enviado) congela el costo por unidad de cada ítem con análisis:
--     deja de seguir los precios de los insumos. Lo demás ya queda fijo al salir del borrador
--     (cantidades, precios directos, tipo de cambio, indirectos, pase y honorarios).
--   · Una versión nueva copia otra; la anterior queda congelada y reemplazada.
--   · Dos versiones se comparan por rubro e ítem.
--   · Un presupuesto se ve actualizado por índice (materiales y mano de obra con su serie, o una
--     serie general), sin cambiar sus montos: es una proyección, como el honorario ajustado.

-- ---------------------------------------------------------------------------
-- Cabecera
-- ---------------------------------------------------------------------------
alter table public.budgets
  add column issued_at          timestamptz,
  add column copied_from        uuid references public.budgets (id) on delete set null,
  -- Ajuste por índice: none · general (una serie para todo) · by_part (materiales y mano de obra
  -- con su serie; el resto con la general, si hay). Los nombres son los de price_indices.
  add column index_mode         text not null default 'none' check (index_mode in ('none', 'general', 'by_part')),
  add column index_base_period  date check (extract(day from index_base_period) = 1),
  add column index_general      text check (length(btrim(index_general)) between 2 and 60),
  add column index_materials    text check (length(btrim(index_materials)) between 2 and 60),
  add column index_labor        text check (length(btrim(index_labor)) between 2 and 60),
  add constraint budgets_index_fields check (
    (index_mode = 'none' and index_base_period is null and index_general is null and index_materials is null and index_labor is null) or
    (index_mode = 'general' and index_base_period is not null and index_general is not null
       and index_materials is null and index_labor is null) or
    (index_mode = 'by_part' and index_base_period is not null and index_materials is not null and index_labor is not null));
create index budgets_copied_from_idx on public.budgets (copied_from);

-- ---------------------------------------------------------------------------
-- Costos por unidad: en vivo y congelados
-- ---------------------------------------------------------------------------
-- Costo por unidad de los ítems con análisis, en la moneda del presupuesto, con los precios de
-- hoy (lo que antes calculaba budget_item_costs adentro). factor nulo = falta el tipo de cambio.
create view public.budget_item_unit_costs
with (security_invoker = true) as
select
  i.id as item_id, i.org_id, i.budget_id,
  sum(c.materials * f.factor) as u_materials,
  sum(c.labor * f.factor) as u_labor,
  sum(c.equipment * f.factor) as u_equipment,
  coalesce(sum(c.unpriced_components), 0)::integer as unpriced_components,
  coalesce(bool_or(f.factor is null), false) as missing_rate
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
group by i.id, i.org_id, i.budget_id;

-- La foto del costo por unidad al emitir. Solo la escribe issue_budget.
create table public.budget_item_frozen_costs (
  item_id              uuid primary key references public.budget_items (id) on delete cascade,
  org_id               uuid not null references public.organizations (id) on delete cascade,
  budget_id            uuid not null references public.budgets (id) on delete cascade,
  u_materials          numeric not null default 0,
  u_labor              numeric not null default 0,
  u_equipment          numeric not null default 0,
  unpriced_components  integer not null default 0,
  missing_rate         boolean not null default false,
  frozen_at            timestamptz not null default now()
);
create index budget_item_frozen_costs_budget_idx on public.budget_item_frozen_costs (budget_id);
alter table public.budget_item_frozen_costs enable row level security;
create policy budget_item_frozen_costs_select on public.budget_item_frozen_costs
for select to authenticated using ((select private.is_org_member(org_id)));
revoke all on public.budget_item_frozen_costs from anon;
revoke insert, update, delete on public.budget_item_frozen_costs from authenticated;

-- Mismas columnas que antes. Un ítem con foto usa la foto; si no, los precios de hoy.
create or replace view public.budget_item_costs
with (security_invoker = true) as
with unit_parts as (
  select
    i.id, i.org_id, i.budget_id, i.chapter_id, i.position, i.quantity, i.analysis_id, i.is_subcontract,
    coalesce(fz.unpriced_components, a.unpriced_components, 0) as unpriced_components,
    coalesce(fz.missing_rate, a.missing_rate, false) as missing_rate,
    case when i.analysis_id is null then case when i.direct_class = 'materials' then i.unit_price else 0 end
         else coalesce(fz.u_materials, a.u_materials, 0) end as u_materials,
    case when i.analysis_id is null then case when i.direct_class = 'labor' then i.unit_price else 0 end
         else coalesce(fz.u_labor, a.u_labor, 0) end as u_labor,
    case when i.analysis_id is null then case when i.direct_class = 'equipment' then i.unit_price else 0 end
         else coalesce(fz.u_equipment, a.u_equipment, 0) end as u_equipment,
    case when i.analysis_id is null then case when i.direct_class = 'subcontract' then i.unit_price else 0 end
         else 0 end as u_subcontract,
    case when i.analysis_id is null then case when i.direct_class = 'other' then i.unit_price else 0 end
         else 0 end as u_other
  from public.budget_items i
  left join public.budget_item_frozen_costs fz on fz.item_id = i.id
  left join public.budget_item_unit_costs a on a.item_id = i.id and fz.item_id is null
),
lines as (
  select
    p.*,
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

grant select on public.budget_item_unit_costs to authenticated;
revoke all on public.budget_item_unit_costs from anon;

-- ---------------------------------------------------------------------------
-- Pase reutilizable (la misma cuenta que budget_totals)
-- ---------------------------------------------------------------------------
create or replace function private.markup_amounts(
  p_cost numeric, p_overhead_pct numeric, p_profit_pct numeric, p_tax_pct numeric, p_method text)
returns table (overhead numeric, profit numeric, tax numeric)
language sql immutable
set search_path = ''
as $$
  with g as (select round(p_cost * p_overhead_pct / 100, 2) as overhead),
  p as (select g.overhead,
               case when p_method = 'cascade' then round((p_cost + g.overhead) * p_profit_pct / 100, 2)
                    else round(p_cost * p_profit_pct / 100, 2) end as profit from g)
  select p.overhead, p.profit,
         case when p_method = 'cascade' then round((p_cost + p.overhead + p.profit) * p_tax_pct / 100, 2)
              else round(p_cost * p_tax_pct / 100, 2) end
  from p;
$$;

-- ---------------------------------------------------------------------------
-- Presupuesto actualizado por índice
-- ---------------------------------------------------------------------------
-- Factor = valor actual ÷ valor del mes base, de los índices de la organización (price_indices),
-- igual que las etapas de honorarios. Si falta el valor base o no hay ninguno, el factor queda
-- nulo y se avisa (missing). Ajuste:
--   general  : costo × factor general (en un paramétrico, su total)
--   by_part  : materiales × factor materiales + mano de obra × factor mano de obra
--              + el resto del costo (equipos, subcontratos, otros, personal e indirectos)
--                × factor general (o sin ajustar, si no se eligió serie general)
-- Sobre el costo ajustado se vuelve a aplicar el pase; los honorarios no se ajustan.
create view public.budget_adjusted_totals
with (security_invoker = true) as
with f as (
  select
    bt.*, b.index_mode, b.index_base_period, b.index_general, b.index_materials, b.index_labor,
    gb.value as general_base, gc.value as general_current, gc.period as general_period,
    mb.value as materials_base, mc.value as materials_current, mc.period as materials_period,
    lb.value as labor_base, lc.value as labor_current, lc.period as labor_period
  from public.budget_totals bt
  join public.budgets b on b.id = bt.budget_id
  left join public.price_indices gb on gb.org_id = b.org_id and gb.name = b.index_general and gb.period = b.index_base_period
  left join lateral (select pi.value, pi.period from public.price_indices pi
                     where pi.org_id = b.org_id and pi.name = b.index_general order by pi.period desc limit 1) gc on true
  left join public.price_indices mb on mb.org_id = b.org_id and mb.name = b.index_materials and mb.period = b.index_base_period
  left join lateral (select pi.value, pi.period from public.price_indices pi
                     where pi.org_id = b.org_id and pi.name = b.index_materials order by pi.period desc limit 1) mc on true
  left join public.price_indices lb on lb.org_id = b.org_id and lb.name = b.index_labor and lb.period = b.index_base_period
  left join lateral (select pi.value, pi.period from public.price_indices pi
                     where pi.org_id = b.org_id and pi.name = b.index_labor order by pi.period desc limit 1) lc on true
  where b.index_mode <> 'none'
),
factors as (
  select f.*,
    f.general_current / nullif(f.general_base, 0) as general_factor,
    f.materials_current / nullif(f.materials_base, 0) as materials_factor,
    f.labor_current / nullif(f.labor_base, 0) as labor_factor,
    array_remove(array[
      case when f.index_general is not null and f.general_base is null then f.index_general end,
      case when f.index_materials is not null and f.materials_base is null then f.index_materials end,
      case when f.index_labor is not null and f.labor_base is null then f.index_labor end
    ], null) as missing
  from f
),
adjusted as (
  select x.*,
    case
      when cardinality(x.missing) > 0 then null
      when x.index_mode = 'general' then round(x.cost * x.general_factor, 2)
      else round(coalesce(x.materials, 0) * x.materials_factor, 2)
         + round(coalesce(x.labor, 0) * x.labor_factor, 2)
         + round((x.cost - coalesce(x.materials, 0) - coalesce(x.labor, 0)) * coalesce(x.general_factor, 1), 2)
    end as adjusted_cost
  from factors x
)
select
  a.budget_id, a.org_id, a.project_id, a.currency, a.index_mode, a.index_base_period,
  a.index_general, a.index_materials, a.index_labor,
  round(a.general_factor, 4) as general_factor, a.general_period,
  round(a.materials_factor, 4) as materials_factor, a.materials_period,
  round(a.labor_factor, 4) as labor_factor, a.labor_period,
  a.missing,
  a.cost,
  a.adjusted_cost::numeric(14, 2) as adjusted_cost,
  (m.overhead + m.profit + m.tax)::numeric(14, 2) as adjusted_markup,
  a.fees_amount,
  (a.adjusted_cost + m.overhead + m.profit + m.tax + a.fees_amount)::numeric(14, 2) as adjusted_price,
  round((a.adjusted_cost + m.overhead + m.profit + m.tax + a.fees_amount) / nullif(a.weighted_m2, 0), 2)::numeric(14, 2)
    as adjusted_price_per_m2
from adjusted a
left join lateral private.markup_amounts(a.adjusted_cost, a.overhead_pct, a.profit_pct, a.tax_pct, a.markup_method) m on true;

grant select on public.budget_adjusted_totals to authenticated;
revoke all on public.budget_adjusted_totals from anon;

-- ---------------------------------------------------------------------------
-- RPC
-- ---------------------------------------------------------------------------
-- Emitir: borrador → enviado, con la foto del costo por unidad de cada ítem con análisis.
create or replace function private.freeze_budget(p_budget_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.budget_item_frozen_costs (item_id, org_id, budget_id, u_materials, u_labor, u_equipment,
                                               unpriced_components, missing_rate)
  select u.item_id, u.org_id, u.budget_id, coalesce(u.u_materials, 0), coalesce(u.u_labor, 0), coalesce(u.u_equipment, 0),
         u.unpriced_components, u.missing_rate
  from public.budget_item_unit_costs u
  where u.budget_id = p_budget_id
  on conflict (item_id) do nothing;
end;
$$;

create or replace function public.issue_budget(p_budget_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v public.budgets%rowtype;
begin
  select * into v from public.budgets where id = p_budget_id for update;
  if not found or not private.is_org_member(v.org_id) then
    raise exception 'No tenés acceso a este presupuesto' using errcode = '42501';
  end if;
  if v.status <> 'draft' then
    raise exception 'El presupuesto ya no está en borrador' using errcode = '22023';
  end if;
  perform private.freeze_budget(p_budget_id);
  update public.budgets set status = 'sent', issued_at = now() where id = p_budget_id;
  perform private.log_event(v.org_id, 'budget.issued', 'budget', p_budget_id,
    jsonb_build_object('project_id', v.project_id, 'number', v.number, 'level', v.level));
end;
$$;

-- Versión nueva a partir de otra (por rubros o por ítem). La nueva arranca en borrador con los
-- precios de hoy; la anterior, si estaba en borrador o enviada, queda congelada y reemplazada.
create or replace function public.copy_budget(p_budget_id uuid)
returns table (id uuid, number integer)
language plpgsql security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v public.budgets%rowtype;
  v_number integer;
  v_id uuid;
begin
  select * into v from public.budgets b where b.id = p_budget_id;
  if not found or not private.is_org_member(v.org_id) then
    raise exception 'No tenés acceso a este presupuesto' using errcode = '42501';
  end if;
  if not private.has_feature(v.org_id, 'works') then
    raise exception 'Las funciones de obra no están habilitadas para tu organización' using errcode = '42501';
  end if;
  if v.level = 'parametric' then
    raise exception 'Una estimación paramétrica no se copia: creá un presupuesto por ítem' using errcode = '22023';
  end if;
  if v.status = 'void' then
    raise exception 'Un presupuesto anulado no se copia' using errcode = '22023';
  end if;

  perform 1 from public.projects p where p.id = v.project_id for update;
  select coalesce(max(b.number), 0) + 1 into v_number from public.budgets b where b.project_id = v.project_id;

  insert into public.budgets (org_id, project_id, number, level, currency, covered_m2, semicovered_m2,
                              semicovered_factor, typology, quality, exchange_rate, notes, created_by,
                              overhead_pct, profit_pct, tax_pct, markup_method,
                              fees_mode, fees_hours, fees_hourly_rate, fees_amount, fees_taken_at,
                              index_mode, index_base_period, index_general, index_materials, index_labor, copied_from)
  values (v.org_id, v.project_id, v_number, v.level, v.currency, v.covered_m2, v.semicovered_m2,
          v.semicovered_factor, v.typology, v.quality, v.exchange_rate, v.notes, (select auth.uid()),
          v.overhead_pct, v.profit_pct, v.tax_pct, v.markup_method,
          v.fees_mode, v.fees_hours, v.fees_hourly_rate, v.fees_amount, v.fees_taken_at,
          v.index_mode, v.index_base_period, v.index_general, v.index_materials, v.index_labor, v.id)
  returning budgets.id into v_id;

  -- Rubros (el nombre es único en cada presupuesto: sirve para emparejar los ítems).
  insert into public.budget_chapters (budget_id, name, position)
  select v_id, c.name, c.position from public.budget_chapters c where c.budget_id = p_budget_id;
  insert into public.budget_items (budget_id, chapter_id, position, description, unit, quantity, quantity_source,
                                   analysis_id, unit_price, direct_class, is_subcontract, created_by)
  select v_id, nc.id, i.position, i.description, i.unit, i.quantity, i.quantity_source,
         i.analysis_id, i.unit_price, i.direct_class, i.is_subcontract, (select auth.uid())
  from public.budget_items i
  join public.budget_chapters oc on oc.id = i.chapter_id
  join public.budget_chapters nc on nc.budget_id = v_id and nc.name = oc.name
  where i.budget_id = p_budget_id;
  insert into public.budget_overheads (budget_id, position, kind, concept, months, monthly_cost, created_by)
  select v_id, o.position, o.kind, o.concept, o.months, o.monthly_cost, (select auth.uid())
  from public.budget_overheads o where o.budget_id = p_budget_id;

  -- La anterior queda como estaba el día que se reemplazó.
  if v.status in ('draft', 'sent') then
    perform private.freeze_budget(p_budget_id);
    update public.budgets b set status = 'superseded', issued_at = coalesce(b.issued_at, now()) where b.id = p_budget_id;
  end if;

  perform private.log_event(v.org_id, 'budget.copied', 'budget', v_id,
    jsonb_build_object('project_id', v.project_id, 'number', v_number, 'from_number', v.number, 'level', v.level));
  return query select v_id, v_number;
end;
$$;

-- Ajuste por índice. Se puede cambiar en cualquier estado (no toca los montos del presupuesto)
-- salvo anulado. Cada índice tiene que tener valores cargados en la organización.
create or replace function public.set_budget_index(
  p_budget_id uuid, p_mode text, p_base_period date default null,
  p_general text default null, p_materials text default null, p_labor text default null)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v public.budgets%rowtype;
  v_name text;
begin
  select * into v from public.budgets where id = p_budget_id;
  if not found or not private.is_org_member(v.org_id) then
    raise exception 'No tenés acceso a este presupuesto' using errcode = '42501';
  end if;
  if v.status = 'void' then
    raise exception 'El presupuesto está anulado' using errcode = '22023';
  end if;
  if p_mode not in ('none', 'general', 'by_part') then
    raise exception 'Modo de ajuste inválido' using errcode = '22023';
  end if;
  if p_mode = 'by_part' and v.level = 'parametric' then
    raise exception 'Una estimación paramétrica se ajusta con una serie general' using errcode = '22023';
  end if;
  if p_mode <> 'none' and p_base_period is null then
    raise exception 'Elegí el mes base' using errcode = '23514';
  end if;
  if p_mode = 'general' and nullif(btrim(p_general), '') is null then
    raise exception 'Elegí el índice general' using errcode = '23514';
  end if;
  if p_mode = 'by_part' and (nullif(btrim(p_materials), '') is null or nullif(btrim(p_labor), '') is null) then
    raise exception 'Elegí los índices de materiales y de mano de obra' using errcode = '23514';
  end if;
  foreach v_name in array array_remove(array[
      case when p_mode <> 'none' then nullif(btrim(p_general), '') end,
      case when p_mode = 'by_part' then nullif(btrim(p_materials), '') end,
      case when p_mode = 'by_part' then nullif(btrim(p_labor), '') end], null) loop
    if not exists (select 1 from public.price_indices pi where pi.org_id = v.org_id and pi.name = v_name) then
      raise exception 'No hay valores cargados del índice %', v_name using errcode = '23514';
    end if;
  end loop;

  update public.budgets
  set index_mode = p_mode,
      index_base_period = case when p_mode = 'none' then null else date_trunc('month', p_base_period)::date end,
      index_general = case when p_mode = 'none' then null else nullif(btrim(p_general), '') end,
      index_materials = case when p_mode = 'by_part' then nullif(btrim(p_materials), '') end,
      index_labor = case when p_mode = 'by_part' then nullif(btrim(p_labor), '') end
  where id = p_budget_id;
  perform private.log_event(v.org_id, 'budget.index_set', 'budget', p_budget_id,
    jsonb_build_object('project_id', v.project_id, 'number', v.number, 'mode', p_mode, 'base_period', p_base_period));
end;
$$;

-- Comparación de dos versiones por rubro e ítem. Los ítems se emparejan por el código del
-- análisis o, si son de precio directo, por la descripción (sin mayúsculas ni espacios de más);
-- si se repiten en un rubro, por orden de aparición. Corre con los permisos de quien consulta.
create or replace function public.compare_budgets(p_a uuid, p_b uuid)
returns table (
  chapter text, item_key text, description text, unit text,
  quantity_a numeric, quantity_b numeric, unit_price_a numeric, unit_price_b numeric,
  total_a numeric, total_b numeric, change text)
language sql stable
set search_path = ''
as $$
  with rows as (
    select i.budget_id, c.name as chapter, c.position as chapter_position, i.position,
           coalesce(ua.code, lower(regexp_replace(btrim(i.description), '\s+', ' ', 'g'))) as key,
           i.description, i.unit, i.quantity, ic.total
    from public.budget_items i
    join public.budget_chapters c on c.id = i.chapter_id
    left join public.unit_analyses ua on ua.id = i.analysis_id
    join public.budget_item_costs ic on ic.item_id = i.id
    where i.budget_id in (p_a, p_b)
  ),
  numbered as (
    select r.*, row_number() over (partition by r.budget_id, r.chapter, r.key order by r.position) as n from rows r
  ),
  a as (select * from numbered where budget_id = p_a),
  b as (select * from numbered where budget_id = p_b)
  select
    coalesce(b.chapter, a.chapter), coalesce(b.key, a.key), coalesce(b.description, a.description), coalesce(b.unit, a.unit),
    a.quantity, b.quantity,
    round(a.total / nullif(a.quantity, 0), 2), round(b.total / nullif(b.quantity, 0), 2),
    a.total, b.total,
    case when a.key is null then 'added'
         when b.key is null then 'removed'
         when a.quantity = b.quantity and a.total = b.total then 'same'
         else 'changed' end
  from a full join b on a.chapter = b.chapter and a.key = b.key and a.n = b.n
  order by coalesce(b.chapter_position, a.chapter_position), coalesce(b.chapter, a.chapter), coalesce(b.position, a.position);
$$;

revoke execute on function public.issue_budget(uuid) from public, anon;
revoke execute on function public.copy_budget(uuid) from public, anon;
revoke execute on function public.set_budget_index(uuid, text, date, text, text, text) from public, anon;
revoke execute on function public.compare_budgets(uuid, uuid) from public, anon;
grant execute on function public.issue_budget(uuid) to authenticated;
grant execute on function public.copy_budget(uuid) to authenticated;
grant execute on function public.set_budget_index(uuid, text, date, text, text, text) to authenticated;
grant execute on function public.compare_budgets(uuid, uuid) to authenticated;

revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;
