-- Revisión de rendimiento: vistas de resumen para que las pantallas pidan lo que muestran.
-- Con las series de referencia, `price_indices` y `reference_values` crecen con cada mes de cada
-- serie: traer todas las filas para quedarse con la última o con los nombres choca con el tope
-- de filas de la API (1000) y manda de más al navegador. Las cuentas quedan en la base.

-- Resumen por serie de referencia: cuántos meses tiene y cuál es el último valor.
create view public.reference_series_summary
with (security_invoker = true) as
select
  s.code, s.name, s.unit, s.publisher, s.source_url, s.note, s.position,
  coalesce(v.months, 0)::integer as months,
  coalesce(v.provisional_months, 0)::integer as provisional_months,
  l.period as last_period, l.value as last_value, coalesce(l.provisional, false) as last_provisional
from public.reference_series s
left join (
  select series_code, count(*) as months, count(*) filter (where provisional) as provisional_months
  from public.reference_values group by series_code
) v on v.series_code = s.code
left join lateral (
  select rv.period, rv.value, rv.provisional from public.reference_values rv
  where rv.series_code = s.code order by rv.period desc limit 1
) l on true;

-- Historial de cada índice del estudio con su orden (1 = el mes más nuevo) y el valor del mes
-- anterior, para mostrar los últimos N meses con su variación sin traer toda la historia.
create view public.price_index_history
with (security_invoker = true) as
select
  pi.id, pi.org_id, pi.name, pi.period, pi.value, pi.reference_series_code, pi.provisional,
  lag(pi.value) over (partition by pi.org_id, pi.name order by pi.period) as previous_value,
  row_number() over (partition by pi.org_id, pi.name order by pi.period desc)::integer as recency,
  count(*) over (partition by pi.org_id, pi.name)::integer as months
from public.price_indices pi;

-- Un renglón por índice (para los desplegables), en vez de un renglón por mes.
create view public.price_index_names
with (security_invoker = true) as
select pi.org_id, pi.name, bool_or(pi.reference_series_code is not null) as adopted,
       count(*)::integer as months, max(pi.period) as last_period
from public.price_indices pi
group by pi.org_id, pi.name;

-- La última versión de presupuesto de cada proyecto.
create view public.latest_budget_totals
with (security_invoker = true) as
select distinct on (bt.project_id)
  bt.budget_id, bt.org_id, bt.project_id, bt.number, bt.level, bt.status, bt.currency,
  bt.weighted_m2, bt.total, bt.cost_per_m2
from public.budget_totals bt
order by bt.project_id, bt.number desc;

-- Rentabilidad por proyecto y moneda (suma de stage_profitability; a un miembro le devuelve vacío).
create view public.project_profitability
with (security_invoker = true) as
select sp.org_id, sp.project_id, sp.currency,
       sum(sp.income)::numeric(14, 2) as income,
       sum(sp.cost)::numeric(14, 2) as cost,
       sum(sp.profit)::numeric(14, 2) as profit,
       sum(sp.hours_missing_cost)::numeric(10, 2) as hours_missing_cost
from public.stage_profitability sp
group by sp.org_id, sp.project_id, sp.currency;

revoke all on public.reference_series_summary, public.price_index_history, public.price_index_names,
  public.latest_budget_totals, public.project_profitability from anon;
grant select on public.reference_series_summary, public.price_index_history, public.price_index_names,
  public.latest_budget_totals, public.project_profitability to authenticated;

-- Índices que faltaban: la propagación de cada valor busca qué organizaciones adoptaron la
-- serie, y borrar un usuario recorre sus costos.
create index org_reference_series_series_idx on public.org_reference_series (series_code);
create index member_costs_user_idx on public.member_costs (user_id);
