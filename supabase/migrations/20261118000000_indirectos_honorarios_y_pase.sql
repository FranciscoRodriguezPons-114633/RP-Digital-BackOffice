-- Finanzas de obra · Sprint 7: indirectos, honorarios y coeficiente de pase
-- El presupuesto termina en un precio. Al costo directo de los ítems se suman el personal y los
-- indirectos por mes de obra (capataz, sereno, obrador, seguros); sobre ese costo va el pase
-- (gastos generales, beneficio e impuestos, en cascada o sobre el costo) y, en su propia línea,
-- los honorarios de arquitectos. El resultado es el precio sin IVA, total y por m².
-- Qué impuestos van dentro del pase y si se aplica en cascada lo valida el contador: hasta
-- entonces los impuestos son un porcentaje libre y el método se elige por presupuesto.

-- ---------------------------------------------------------------------------
-- Cabecera: pase y honorarios
-- ---------------------------------------------------------------------------
alter table public.budgets
  add column overhead_pct     numeric(6, 3) not null default 0 check (overhead_pct >= 0 and overhead_pct <= 100),
  add column profit_pct       numeric(6, 3) not null default 0 check (profit_pct >= 0 and profit_pct <= 100),
  add column tax_pct          numeric(6, 3) not null default 0 check (tax_pct >= 0 and tax_pct <= 100),
  -- cascade: cada porcentaje va sobre el subtotal anterior · on_cost: todos sobre el costo.
  add column markup_method    text not null default 'cascade' check (markup_method in ('cascade', 'on_cost')),
  -- Honorarios de arquitectos: de las etapas del proyecto (una foto del momento en que se
  -- tomaron) o por horas estimadas × costo por hora. Siempre en la moneda del presupuesto.
  add column fees_mode        text not null default 'none' check (fees_mode in ('none', 'stages', 'hours')),
  add column fees_hours       numeric(10, 2) check (fees_hours > 0),
  add column fees_hourly_rate numeric(14, 2) check (fees_hourly_rate > 0),
  add column fees_amount      numeric(14, 2) check (fees_amount >= 0),
  add column fees_taken_at    timestamptz,
  add constraint budgets_fees_fields check (
    (fees_mode = 'none' and fees_amount is null and fees_hours is null and fees_hourly_rate is null) or
    (fees_mode = 'stages' and fees_amount is not null and fees_hours is null and fees_hourly_rate is null) or
    (fees_mode = 'hours' and fees_amount is not null and fees_hours is not null and fees_hourly_rate is not null));

-- ---------------------------------------------------------------------------
-- Personal e indirectos por mes de obra
-- ---------------------------------------------------------------------------
create table public.budget_overheads (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id) on delete cascade,
  budget_id     uuid not null references public.budgets (id) on delete cascade,
  position      integer not null default 0,
  -- staff: personal de obra (capataz, sereno, jefe de obra) · indirect: obrador, seguros, servicios.
  kind          text not null check (kind in ('staff', 'indirect')),
  concept       text not null check (length(btrim(concept)) between 2 and 120),
  months        numeric(6, 2) not null check (months > 0),
  -- Costo mensual en la moneda del presupuesto. Sin cargar (null) no suma y se avisa.
  monthly_cost  numeric(14, 2) check (monthly_cost > 0),
  created_by    uuid not null references auth.users (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index budget_overheads_budget_idx on public.budget_overheads (budget_id, position);
create index budget_overheads_org_idx on public.budget_overheads (org_id);

-- Igual que los ítems: solo en borrador y nunca en un paramétrico (assert_budget_editable).
create or replace function private.budget_overhead_before_write()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v public.budgets%rowtype;
begin
  if tg_op = 'DELETE' then
    -- Se está borrando el presupuesto (o el proyecto) entero.
    if not exists (select 1 from public.budgets b where b.id = old.budget_id) then
      return old;
    end if;
    perform private.assert_budget_editable(old.budget_id);
    return old;
  end if;
  v := private.assert_budget_editable(new.budget_id);
  if tg_op = 'UPDATE' and new.budget_id <> old.budget_id then
    raise exception 'Un indirecto no cambia de presupuesto' using errcode = '22023';
  end if;
  new.org_id := v.org_id;
  new.concept := btrim(new.concept);
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  return new;
end;
$$;
create trigger budget_overheads_before_write before insert or update or delete on public.budget_overheads
for each row execute function private.budget_overhead_before_write();

alter table public.budget_overheads enable row level security;

create policy budget_overheads_select on public.budget_overheads
for select to authenticated using ((select private.is_org_member(org_id)));
create policy budget_overheads_insert on public.budget_overheads
for insert to authenticated
with check ((select private.is_org_member(org_id)) and (select private.has_feature(org_id, 'works'))
            and created_by = (select auth.uid()));
create policy budget_overheads_update on public.budget_overheads
for update to authenticated
using ((select private.is_org_member(org_id))) with check ((select private.is_org_member(org_id)));
create policy budget_overheads_delete on public.budget_overheads
for delete to authenticated using ((select private.is_org_member(org_id)));

revoke all on public.budget_overheads from anon;
revoke update on public.budget_overheads from authenticated;
grant update (position, kind, concept, months, monthly_cost) on public.budget_overheads to authenticated;

-- ---------------------------------------------------------------------------
-- Totales con el precio
-- ---------------------------------------------------------------------------
-- Mismas columnas que antes (las usan latest_budget_totals y la app) y, al final, el resumen
-- completo. Cada monto se redondea a 2 decimales y el precio es la suma de los montos
-- redondeados, así el resumen cierra al centavo.
--   costo     = costo directo de los ítems + personal + indirectos
--   cascada   : GG = costo × gg% · B = (costo + GG) × b% · I = (costo + GG + B) × i%
--   s/ costo  : GG = costo × gg% · B = costo × b%        · I = costo × i%
--   precio    = costo + GG + B + I + honorarios (sin IVA)
-- Un paramétrico no tiene indirectos ni pase: su precio es su total.
create or replace view public.budget_totals
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
),
overheads as (
  select
    o.budget_id,
    sum(round(o.months * o.monthly_cost, 2)) filter (where o.kind = 'staff') as staff,
    sum(round(o.months * o.monthly_cost, 2)) filter (where o.kind = 'indirect') as indirect,
    count(*) filter (where o.monthly_cost is null)::integer as unpriced
  from public.budget_overheads o
  group by o.budget_id
)
select
  b.id as budget_id, b.org_id, b.project_id, b.number, b.level, b.status, b.currency,
  b.covered_m2 + b.semicovered_m2 * b.semicovered_factor as weighted_m2,
  d.direct as total,
  (case when b.level = 'parametric'
        then round(b.reference_cost_m2 * b.typology_coef * b.quality_coef, 2)
        else round(d.direct / nullif(b.covered_m2 + b.semicovered_m2 * b.semicovered_factor, 0), 2)
   end)::numeric(14, 2) as cost_per_m2,
  i.materials::numeric(14, 2) as materials,
  i.labor::numeric(14, 2) as labor,
  i.equipment::numeric(14, 2) as equipment,
  i.subcontract::numeric(14, 2) as subcontract,
  i.other::numeric(14, 2) as other,
  coalesce(i.items, 0) as items,
  coalesce(i.items_unpriced, 0) as items_unpriced,
  coalesce(i.items_missing_rate, 0) as items_missing_rate,
  -- Desde acá, lo del sprint 7.
  coalesce(o.staff, 0)::numeric(14, 2) as overheads_staff,
  coalesce(o.indirect, 0)::numeric(14, 2) as overheads_indirect,
  coalesce(o.unpriced, 0) as overheads_unpriced,
  c.cost::numeric(14, 2) as cost,
  b.overhead_pct, b.profit_pct, b.tax_pct, b.markup_method,
  m1.overhead_amount::numeric(14, 2) as overhead_amount,
  m2.profit_amount::numeric(14, 2) as profit_amount,
  m3.tax_amount::numeric(14, 2) as tax_amount,
  (m1.overhead_amount + m2.profit_amount + m3.tax_amount)::numeric(14, 2) as markup_amount,
  b.fees_mode,
  coalesce(b.fees_amount, 0)::numeric(14, 2) as fees_amount,
  b.fees_taken_at,
  (c.cost + m1.overhead_amount + m2.profit_amount + m3.tax_amount + coalesce(b.fees_amount, 0))::numeric(14, 2) as price,
  round((c.cost + m1.overhead_amount + m2.profit_amount + m3.tax_amount + coalesce(b.fees_amount, 0))
        / nullif(b.covered_m2 + b.semicovered_m2 * b.semicovered_factor, 0), 2)::numeric(14, 2) as price_per_m2
from public.budgets b
left join items i on i.budget_id = b.id
left join overheads o on o.budget_id = b.id
cross join lateral (
  select (case when b.level = 'parametric'
               then round((b.covered_m2 + b.semicovered_m2 * b.semicovered_factor)
                          * b.reference_cost_m2 * b.typology_coef * b.quality_coef, 2)
               else coalesce(i.total, 0) end)::numeric(14, 2) as direct
) d
cross join lateral (select d.direct + coalesce(o.staff, 0) + coalesce(o.indirect, 0) as cost) c
cross join lateral (select round(c.cost * b.overhead_pct / 100, 2) as overhead_amount) m1
cross join lateral (
  select case when b.markup_method = 'cascade' then round((c.cost + m1.overhead_amount) * b.profit_pct / 100, 2)
              else round(c.cost * b.profit_pct / 100, 2) end as profit_amount
) m2
cross join lateral (
  select case when b.markup_method = 'cascade'
              then round((c.cost + m1.overhead_amount + m2.profit_amount) * b.tax_pct / 100, 2)
              else round(c.cost * b.tax_pct / 100, 2) end as tax_amount
) m3;

-- ---------------------------------------------------------------------------
-- RPC
-- ---------------------------------------------------------------------------
-- Miembro de la organización y presupuesto editable (borrador, por rubros o por ítem).
create or replace function private.editable_budget_for_member(p_budget_id uuid)
returns public.budgets
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
  return private.assert_budget_editable(p_budget_id);
end;
$$;

-- Plantilla de personal e indirectos [I]: capataz, sereno, obrador y seguros (más un jefe de obra
-- si no es una vivienda unifamiliar), por los meses de obra de la ficha (12 si no tiene fechas).
-- Los costos quedan sin cargar. Solo si el presupuesto todavía no tiene ninguno.
create or replace function public.apply_overhead_template(p_budget_id uuid)
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  v public.budgets%rowtype;
  v_work public.works%rowtype;
  v_months numeric;
  v_count integer;
begin
  v := private.editable_budget_for_member(p_budget_id);
  if exists (select 1 from public.budget_overheads o where o.budget_id = p_budget_id) then
    raise exception 'El presupuesto ya tiene personal o indirectos cargados' using errcode = '22023';
  end if;
  select * into v_work from public.works w where w.project_id = v.project_id;
  v_months := case
    when v_work.planned_start is not null and v_work.planned_end is not null and v_work.planned_end > v_work.planned_start
      then greatest(1, ceil((v_work.planned_end - v_work.planned_start) / 30.0))
    else 12 end;

  insert into public.budget_overheads (budget_id, position, kind, concept, months, created_by)
  select p_budget_id, t.n::integer, t.kind, t.concept, v_months, (select auth.uid())
  from (values
    (1, 'staff', 'Jefe de obra', v.typology is distinct from 'single_family'),
    (2, 'staff', 'Capataz', true),
    (3, 'staff', 'Sereno', true),
    (4, 'indirect', 'Obrador, baños y servicios de obra', true),
    (5, 'indirect', 'Seguros (ART, responsabilidad civil y todo riesgo)', true)
  ) as t (n, kind, concept, applies)
  where t.applies;
  get diagnostics v_count = row_count;

  perform private.log_event(v.org_id, 'budget.overhead_template_applied', 'budget', p_budget_id,
    jsonb_build_object('project_id', v.project_id, 'rows', v_count, 'months', v_months));
  return v_count;
end;
$$;

-- Pase: gastos generales, beneficio e impuestos (porcentajes) y el método.
create or replace function public.set_budget_markup(
  p_budget_id uuid, p_overhead_pct numeric, p_profit_pct numeric, p_tax_pct numeric, p_method text)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v public.budgets%rowtype;
begin
  v := private.editable_budget_for_member(p_budget_id);
  if p_method not in ('cascade', 'on_cost') then
    raise exception 'Método de pase inválido' using errcode = '22023';
  end if;
  if coalesce(p_overhead_pct, 0) < 0 or coalesce(p_profit_pct, 0) < 0 or coalesce(p_tax_pct, 0) < 0
     or coalesce(p_overhead_pct, 0) > 100 or coalesce(p_profit_pct, 0) > 100 or coalesce(p_tax_pct, 0) > 100 then
    raise exception 'Cada porcentaje va de 0 a 100' using errcode = '23514';
  end if;
  update public.budgets
  set overhead_pct = coalesce(p_overhead_pct, 0), profit_pct = coalesce(p_profit_pct, 0),
      tax_pct = coalesce(p_tax_pct, 0), markup_method = p_method
  where id = p_budget_id;
  perform private.log_event(v.org_id, 'budget.markup_changed', 'budget', p_budget_id,
    jsonb_build_object('project_id', v.project_id,
      'before', jsonb_build_object('overhead', v.overhead_pct, 'profit', v.profit_pct, 'tax', v.tax_pct, 'method', v.markup_method),
      'after', jsonb_build_object('overhead', coalesce(p_overhead_pct, 0), 'profit', coalesce(p_profit_pct, 0),
                                  'tax', coalesce(p_tax_pct, 0), 'method', p_method)));
end;
$$;

-- Honorarios de arquitectos en el presupuesto.
--   none   : sin honorarios.
--   stages : el honorario actualizado más los adicionales aprobados de todas las etapas del
--            proyecto, en este momento (no sigue los cambios: para actualizarlo se vuelve a
--            tomar). Las etapas en otra moneda se pasan con el tipo de cambio del presupuesto.
--   hours  : horas estimadas × costo por hora.
-- Devuelve el monto que quedó, en la moneda del presupuesto.
create or replace function public.set_budget_fees(
  p_budget_id uuid, p_mode text, p_hours numeric default null, p_hourly_rate numeric default null)
returns numeric
language plpgsql security definer
set search_path = ''
as $$
declare
  v public.budgets%rowtype;
  v_amount numeric;
  v_missing text;
begin
  v := private.editable_budget_for_member(p_budget_id);
  if p_mode = 'none' then
    update public.budgets
    set fees_mode = 'none', fees_amount = null, fees_hours = null, fees_hourly_rate = null, fees_taken_at = null
    where id = p_budget_id;
  elsif p_mode = 'stages' then
    if not exists (select 1 from public.fee_stages s where s.project_id = v.project_id) then
      raise exception 'El proyecto no tiene etapas de honorarios' using errcode = '22023';
    end if;
    -- Una moneda distinta de la del presupuesto necesita el tipo de cambio.
    select min(s.currency) into v_missing
    from public.fee_stage_summary s
    where s.project_id = v.project_id and s.currency <> v.currency and v.exchange_rate is null;
    if v_missing is not null then
      raise exception 'Cargá el tipo de cambio del presupuesto para pasar los honorarios en %', v_missing
        using errcode = '22023';
    end if;
    select coalesce(sum(round(coalesce(s.total_amount, 0) * case
             when s.currency = v.currency then 1
             when v.currency = 'ARS' then v.exchange_rate
             else 1 / v.exchange_rate end, 2)), 0)
    into v_amount
    from public.fee_stage_summary s
    where s.project_id = v.project_id;
    update public.budgets
    set fees_mode = 'stages', fees_amount = v_amount, fees_hours = null, fees_hourly_rate = null, fees_taken_at = now()
    where id = p_budget_id;
  elsif p_mode = 'hours' then
    if p_hours is null or p_hours <= 0 or p_hourly_rate is null or p_hourly_rate <= 0 then
      raise exception 'Cargá las horas y el costo por hora' using errcode = '23514';
    end if;
    v_amount := round(p_hours * p_hourly_rate, 2);
    update public.budgets
    set fees_mode = 'hours', fees_amount = v_amount, fees_hours = p_hours, fees_hourly_rate = p_hourly_rate,
        fees_taken_at = now()
    where id = p_budget_id;
  else
    raise exception 'Modo de honorarios inválido' using errcode = '22023';
  end if;

  perform private.log_event(v.org_id, 'budget.fees_set', 'budget', p_budget_id,
    jsonb_build_object('project_id', v.project_id, 'mode', p_mode, 'amount', v_amount, 'currency', v.currency));
  return v_amount;
end;
$$;

revoke execute on function public.apply_overhead_template(uuid) from public, anon;
revoke execute on function public.set_budget_markup(uuid, numeric, numeric, numeric, text) from public, anon;
revoke execute on function public.set_budget_fees(uuid, text, numeric, numeric) from public, anon;
grant execute on function public.apply_overhead_template(uuid) to authenticated;
grant execute on function public.set_budget_markup(uuid, numeric, numeric, numeric, text) to authenticated;
grant execute on function public.set_budget_fees(uuid, text, numeric, numeric) to authenticated;

revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;
