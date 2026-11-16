-- Finanzas de obra · Sprint 8 · Versiones congeladas, comparación y ajuste por índice.
begin;
create extension if not exists pgtap with schema extensions;
select plan(34);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'ana@estudio-a.com'),     -- dueña A
  ('22222222-2222-2222-2222-222222222222', 'beto@estudio-a.com'),    -- miembro A
  ('33333333-3333-3333-3333-333333333333', 'bruno@estudio-b.com');   -- dueño B

create temp table ids (k text primary key, v uuid);
grant select, insert, update on ids to public;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', true);
insert into ids values ('org_a', public.create_organization('Constructora A'));
with x as (
  insert into public.projects (org_id, name, created_by)
  select v, 'Casa Norte', '11111111-1111-1111-1111-111111111111' from ids where k = 'org_a' returning id)
insert into ids select 'p1', id from x;
select public.invite_member((select v from ids where k = 'org_a'), 'beto@estudio-a.com', 'member');
-- Índices propios de la organización: octubre (base) y noviembre (actual).
insert into public.price_indices (org_id, name, period, value, created_by)
select o.v, t.name, t.period::date, t.value, '11111111-1111-1111-1111-111111111111'
from ids o, (values ('CAC mat', '2026-10-01', 100), ('CAC mat', '2026-11-01', 110),
                    ('CAC MO', '2026-10-01', 200), ('CAC MO', '2026-11-01', 260),
                    ('CAC gral', '2026-10-01', 50), ('CAC gral', '2026-11-01', 60)) as t (name, period, value)
where o.k = 'org_a';
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333"}', true);
insert into ids values ('org_b', public.create_organization('Constructora B'));
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222"}', true);
select public.claim_invitations();
reset role;
update public.organizations set beta_features = '{works}' where id in (select v from ids where k in ('org_a', 'org_b'));

-- Ficha en pesos (100 m²), un insumo de ARS 100 y un análisis de 10 unidades por m2.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222"}', true);
select public.upsert_work((select v from ids where k = 'p1'), 'builder', null, null, 100, 0, 'single_family',
  'standard', null, null, 'ARS');
select * from public.create_parametric_budget((select v from ids where k = 'p1'), 1500000, '2026-10-15', 'Costo propio');
insert into ids select 'par', id from public.budgets where project_id = (select v from ids where k = 'p1') and level = 'parametric';
insert into ids select 'mat', public.upsert_supply((select v from ids where k = 'org_a'), null, 'material', 'MAT', 'Material', 'u', 'ARS', 100, '2026-11-01');
with x as (
  insert into public.unit_analyses (org_id, code, name, unit, chapter, created_by)
  values ((select v from ids where k = 'org_a'), 'MAM', 'Mampostería', 'm2', 'Mampostería', '22222222-2222-2222-2222-222222222222')
  returning id)
insert into ids select 'apu', id from x;
select public.set_unit_analysis_components((select v from ids where k = 'apu'),
  jsonb_build_array(jsonb_build_object('supply_id', (select v from ids where k = 'mat'), 'yield', 10, 'waste_pct', 0)));

-- V2 por ítem: 2 m2 de mampostería (ARS 2.000), mano de obra directa ARS 1.000, capataz 1 × 500,
-- pase 10 % sobre el costo.
insert into ids select 'v2', id from public.create_item_budget((select v from ids where k = 'p1'), 'by_item', false);
with c as (insert into public.budget_chapters (budget_id, name) values ((select v from ids where k = 'v2'), 'Mampostería') returning id)
insert into ids select 'ch', id from c;
insert into public.budget_items (budget_id, chapter_id, description, unit, quantity, analysis_id, created_by)
values ((select v from ids where k = 'v2'), (select v from ids where k = 'ch'), 'Muro', 'm2', 2, (select v from ids where k = 'apu'), '22222222-2222-2222-2222-222222222222');
insert into public.budget_items (budget_id, chapter_id, description, unit, quantity, unit_price, direct_class, created_by)
values ((select v from ids where k = 'v2'), (select v from ids where k = 'ch'), 'Mano de obra', 'gl', 1, 1000, 'labor', '22222222-2222-2222-2222-222222222222');
insert into public.budget_overheads (budget_id, kind, concept, months, monthly_cost, created_by)
values ((select v from ids where k = 'v2'), 'staff', 'Capataz', 1, 500, '22222222-2222-2222-2222-222222222222');
select public.set_budget_markup((select v from ids where k = 'v2'), 10, 0, 0, 'on_cost');

-- 1-4. Emitir congela los costos: el presupuesto deja de seguir los precios.
select is((select price from public.budget_totals where budget_id = (select v from ids where k = 'v2')), 3850.00::numeric,
  'Antes de emitir: costo 3.500 más 10 % de pase');
select public.issue_budget((select v from ids where k = 'v2'));
select results_eq(
  $$ select status, issued_at is not null from public.budgets where id = (select v from ids where k = 'v2') $$,
  $$ values ('sent'::text, true) $$, 'Emitido: pasa a enviado con la fecha');
select public.upsert_supply((select v from ids where k = 'org_a'), (select v from ids where k = 'mat'), 'material', 'MAT', 'Material', 'u', 'ARS', 150, '2026-11-20');
select is((select total from public.budget_totals where budget_id = (select v from ids where k = 'v2')), 3000.00::numeric,
  'Un presupuesto emitido no sigue el precio nuevo del insumo');
select throws_ok($$ select public.issue_budget((select v from ids where k = 'v2')) $$, '22023', null,
  'Se emite una sola vez');

-- 5-10. Versión nueva: copia todo, arranca en borrador con los precios de hoy; la anterior se reemplaza.
insert into ids select 'v3', id from public.copy_budget((select v from ids where k = 'v2'));
select results_eq(
  $$ select number, status, copied_from from public.budgets where id = (select v from ids where k = 'v3') $$,
  $$ values (3, 'draft'::text, (select v from ids where k = 'v2')) $$, 'La copia es la V3, en borrador');
select is((select status from public.budgets where id = (select v from ids where k = 'v2')), 'superseded',
  'La versión copiada queda reemplazada');
select is((select count(*)::integer from public.budget_items where budget_id = (select v from ids where k = 'v3')), 2,
  'Copia los ítems');
select results_eq(
  $$ select total, cost, price from public.budget_totals where budget_id = (select v from ids where k = 'v3') $$,
  $$ values (4000.00::numeric, 4500.00::numeric, 4950.00::numeric) $$,
  'La copia toma el precio de hoy (ARS 150) y conserva indirectos y pase');
select is((select total from public.budget_totals where budget_id = (select v from ids where k = 'v2')), 3000.00::numeric,
  'La versión anterior no se movió');
select throws_ok(
  $$ update public.budget_items set quantity = 9 where budget_id = (select v from ids where k = 'v2') $$,
  '22023', null, 'Una versión reemplazada no se edita');

-- 11-15. Comparación: cantidad cambiada, ítem nuevo y eliminado.
update public.budget_items set quantity = 3 where budget_id = (select v from ids where k = 'v3') and description = 'Muro';
delete from public.budget_items where budget_id = (select v from ids where k = 'v3') and description = 'Mano de obra';
insert into public.budget_items (budget_id, chapter_id, description, unit, quantity, unit_price, direct_class, created_by)
select (select v from ids where k = 'v3'), c.id, 'Pintura', 'gl', 1, 300, 'other', '22222222-2222-2222-2222-222222222222'
from public.budget_chapters c where c.budget_id = (select v from ids where k = 'v3');
select results_eq(
  $$ select change, count(*)::integer from public.compare_budgets((select v from ids where k = 'v2'), (select v from ids where k = 'v3'))
     group by change order by change $$,
  $$ values ('added'::text, 1), ('changed'::text, 1), ('removed'::text, 1) $$,
  'Un ítem nuevo, uno cambiado y uno eliminado');
select results_eq(
  $$ select quantity_a, quantity_b, unit_price_a, unit_price_b, total_a, total_b
     from public.compare_budgets((select v from ids where k = 'v2'), (select v from ids where k = 'v3')) where item_key = 'MAM' $$,
  $$ values (2.0000::numeric, 3.0000::numeric, 1000.00::numeric, 1500.00::numeric, 2000.00::numeric, 4500.00::numeric) $$,
  'Los ítems con análisis se emparejan por código: cantidad, precio y total de cada versión');
select is((select description from public.compare_budgets((select v from ids where k = 'v2'), (select v from ids where k = 'v3')) where change = 'removed'),
  'Mano de obra', 'Los de precio directo se emparejan por descripción');
insert into ids select 'v4', id from public.copy_budget((select v from ids where k = 'v3'));
select is((select number from public.budgets where id = (select v from ids where k = 'v4')), 4, 'La numeración sigue sin repetirse');
select is((select status from public.budgets where id = (select v from ids where k = 'v3')), 'superseded',
  'Copiar un borrador lo congela y lo reemplaza');

-- 16-17. Un paramétrico no se copia ni se ajusta por partes.
select throws_ok($$ select * from public.copy_budget((select v from ids where k = 'par')) $$, '22023', null,
  'Un paramétrico no se copia');
select throws_ok($$ select public.set_budget_index((select v from ids where k = 'par'), 'by_part', '2026-10-01', null, 'CAC mat', 'CAC MO') $$,
  '22023', null, 'Un paramétrico se ajusta con una serie general');

-- 18-22. Ajuste por partes de la V2 (emitida): materiales × 1,1 + mano de obra × 1,3 + resto × 1,2.
--   2.000 × 1,1 + 1.000 × 1,3 + 500 × 1,2 = 4.100; pase 10 % = 410; precio 4.510.
select public.set_budget_index((select v from ids where k = 'v2'), 'by_part', '2026-10-15', 'CAC gral', 'CAC mat', 'CAC MO');
select is((select index_base_period from public.budgets where id = (select v from ids where k = 'v2')), '2026-10-01'::date,
  'El mes base se guarda como primer día del mes');
select results_eq(
  $$ select materials_factor, labor_factor, general_factor, cardinality(missing)
     from public.budget_adjusted_totals where budget_id = (select v from ids where k = 'v2') $$,
  $$ values (1.1000::numeric, 1.3000::numeric, 1.2000::numeric, 0) $$,
  'Factores: valor actual ÷ valor del mes base');
select results_eq(
  $$ select adjusted_cost, adjusted_markup, adjusted_price, adjusted_price_per_m2
     from public.budget_adjusted_totals where budget_id = (select v from ids where k = 'v2') $$,
  $$ values (4100.00::numeric, 410.00::numeric, 4510.00::numeric, 45.10::numeric) $$,
  'Costo ajustado por partes, con el pase de nuevo encima');
select is((select price from public.budget_totals where budget_id = (select v from ids where k = 'v2')), 3850.00::numeric,
  'Ajustar no cambia los montos del presupuesto');
select public.set_budget_index((select v from ids where k = 'v2'), 'general', '2026-10-01', 'CAC gral');
select is((select adjusted_cost from public.budget_adjusted_totals where budget_id = (select v from ids where k = 'v2')), 4200.00::numeric,
  'General: todo el costo por la serie general (3.500 × 1,2)');

-- 23-25. Falta el valor base: se avisa y no se ajusta. Índice sin valores: no se acepta.
select public.set_budget_index((select v from ids where k = 'v2'), 'general', '2026-09-01', 'CAC gral');
select results_eq(
  $$ select missing, adjusted_cost from public.budget_adjusted_totals where budget_id = (select v from ids where k = 'v2') $$,
  $$ values (array['CAC gral']::text[], null::numeric) $$,
  'Sin el valor del mes base, avisa qué índice falta y no ajusta');
select throws_ok($$ select public.set_budget_index((select v from ids where k = 'v2'), 'general', '2026-10-01', 'Otro') $$,
  '23514', 'No hay valores cargados del índice Otro', 'Un índice sin valores no se acepta');
select public.set_budget_index((select v from ids where k = 'par'), 'general', '2026-10-01', 'CAC gral');
select is(
  (select adjusted_cost from public.budget_adjusted_totals where budget_id = (select v from ids where k = 'par')),
  round((select total from public.budget_totals where budget_id = (select v from ids where k = 'par')) * 1.2, 2),
  'El paramétrico se ajusta igual, con la serie general');

-- 26-28. Sin ajuste no hay fila; eventos para el historial.
select public.set_budget_index((select v from ids where k = 'v2'), 'none');
select is_empty($$ select 1 from public.budget_adjusted_totals where budget_id = (select v from ids where k = 'v2') $$,
  'Sin ajuste, no hay montos ajustados');
select ok(exists (select 1 from public.events where type = 'budget.issued' and data->>'project_id' = (select v from ids where k = 'p1')::text),
  'Emitir queda en el historial del proyecto');
select ok(exists (select 1 from public.events where type = 'budget.copied' and (data->>'from_number')::int = 2),
  'La versión nueva dice de cuál salió');

-- 29-30. La foto no se escribe a mano.
select throws_ok(
  $$ insert into public.budget_item_frozen_costs (item_id, org_id, budget_id)
     select id, org_id, budget_id from public.budget_items where budget_id = (select v from ids where k = 'v4') limit 1 $$,
  '42501', null, 'Nadie escribe la foto de costos a mano');
select isnt_empty($$ select 1 from public.budget_item_frozen_costs where budget_id = (select v from ids where k = 'v2') $$,
  'La foto se lee');

-- 31-34. Otra organización no ve ni toca nada.
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333"}', true);
select throws_ok($$ select * from public.copy_budget((select v from ids where k = 'v4')) $$, '42501', null, 'B no copia presupuestos de A');
select throws_ok($$ select public.issue_budget((select v from ids where k = 'v4')) $$, '42501', null, 'B no emite presupuestos de A');
select throws_ok($$ select public.set_budget_index((select v from ids where k = 'v4'), 'none') $$, '42501', null, 'B no ajusta presupuestos de A');
select is_empty($$ select * from public.compare_budgets((select v from ids where k = 'v2'), (select v from ids where k = 'v3')) $$,
  'B no ve la comparación de A');

select * from finish();
rollback;
