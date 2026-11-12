-- Finanzas de obra · Sprint 6 · Presupuesto por ítem: totales, desglose, borrador y aislamiento.
begin;
create extension if not exists pgtap with schema extensions;
select plan(32);

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
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333"}', true);
insert into ids values ('org_b', public.create_organization('Constructora B'));
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222"}', true);
select public.claim_invitations();
reset role;
update public.organizations set beta_features = '{works}' where id in (select v from ids where k in ('org_a', 'org_b'));

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222"}', true);
select throws_ok($$ select * from public.create_item_budget((select v from ids where k = 'p1'), 'by_item') $$,
  '22023', null, 'Sin ficha de obra no hay presupuesto');

-- Ficha en pesos (100 m² cubiertos), tipo de cambio y una estimación paramétrica (V1).
select public.upsert_work((select v from ids where k = 'p1'), 'builder', null, null, 100, 0, 'single_family',
  'standard', null, null, 'ARS');
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', true);
insert into public.exchange_rates (org_id, rate_date, source, rate, created_by) values
  ((select v from ids where k = 'org_a'), '2026-11-01', 'official', 950, '11111111-1111-1111-1111-111111111111'),
  ((select v from ids where k = 'org_a'), '2026-11-10', 'official', 1000, '11111111-1111-1111-1111-111111111111'),
  ((select v from ids where k = 'org_a'), '2026-11-11', 'blue', 1300, '11111111-1111-1111-1111-111111111111');
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222"}', true);
select * from public.create_parametric_budget((select v from ids where k = 'p1'), 1500000, '2026-11-01', 'Costo propio');

-- Insumos y análisis: materiales 10 × ARS 100, mano de obra 2 × ARS 500, equipo 1 × USD 1,50 por unidad.
insert into ids select 'mat', public.upsert_supply((select v from ids where k = 'org_a'), null, 'material', 'MAT', 'Material', 'u', 'ARS', 100, '2026-11-01');
insert into ids select 'mo', public.upsert_supply((select v from ids where k = 'org_a'), null, 'labor', 'MO', 'Oficial', 'h', 'ARS', 500, '2026-11-01');
insert into ids select 'eq', public.upsert_supply((select v from ids where k = 'org_a'), null, 'equipment', 'EQ', 'Equipo', 'día', 'USD', 1.5, '2026-11-01');
insert into ids select 'np', public.upsert_supply((select v from ids where k = 'org_a'), null, 'material', 'NP', 'Sin precio', 'u', 'ARS', null, null);
with x as (
  insert into public.unit_analyses (org_id, code, name, unit, chapter, created_by)
  values ((select v from ids where k = 'org_a'), 'MAM', 'Mampostería', 'm2', 'Mampostería', '22222222-2222-2222-2222-222222222222')
  returning id)
insert into ids select 'apu', id from x;
select public.set_unit_analysis_components((select v from ids where k = 'apu'), (
  select jsonb_agg(jsonb_build_object('supply_id', i.v, 'yield', t.y, 'waste_pct', 0) order by t.n)
  from (values (1, 'mat', 10), (2, 'mo', 2), (3, 'eq', 1)) as t (n, k, y) join ids i on i.k = t.k));
with x as (
  insert into public.unit_analyses (org_id, code, name, unit, chapter, created_by)
  values ((select v from ids where k = 'org_a'), 'NP-APU', 'Con insumo sin precio', 'm2', 'Varios', '22222222-2222-2222-2222-222222222222')
  returning id)
insert into ids select 'apu_np', id from x;
select public.set_unit_analysis_components((select v from ids where k = 'apu_np'), (
  select jsonb_agg(jsonb_build_object('supply_id', i.v, 'yield', 1, 'waste_pct', 0)) from ids i where i.k in ('mat', 'np')));

-- Presupuesto por ítem ----------------------------------------------------------------
insert into ids select 'bud', id from public.create_item_budget((select v from ids where k = 'p1'), 'by_item');
select results_eq(
  $$ select number, level, status, currency, exchange_rate from public.budgets where id = (select v from ids where k = 'bud') $$,
  $$ values (2, 'by_item'::text, 'draft'::text, 'ARS'::text, 1000.0000::numeric) $$,
  'Un miembro crea el presupuesto: sigue la numeración, en borrador y con el último tipo de cambio oficial');
select is((select count(*)::int from public.budget_chapters where budget_id = (select v from ids where k = 'bud')), 15,
  'Arranca con la plantilla de rubros');
insert into ids select 'mam', id from public.budget_chapters where budget_id = (select v from ids where k = 'bud') and name = 'Mampostería';
insert into ids select 'var', id from public.budget_chapters where budget_id = (select v from ids where k = 'bud') and name = 'Varios';
insert into ids select 'ele', id from public.budget_chapters where budget_id = (select v from ids where k = 'bud') and name = 'Instalación eléctrica';

-- Ítems: por análisis, por precio directo y subcontratados.
insert into public.budget_items (budget_id, chapter_id, position, description, unit, quantity, analysis_id, created_by) values
  ((select v from ids where k = 'bud'), (select v from ids where k = 'mam'), 1, 'Muro de 18 cm', 'm2', 12.5,
   (select v from ids where k = 'apu'), '22222222-2222-2222-2222-222222222222');
insert into public.budget_items (budget_id, chapter_id, position, description, unit, quantity, analysis_id, is_subcontract, created_by) values
  ((select v from ids where k = 'bud'), (select v from ids where k = 'mam'), 2, 'Tabique subcontratado', 'm2', 10,
   (select v from ids where k = 'apu'), true, '22222222-2222-2222-2222-222222222222');
insert into public.budget_items (budget_id, chapter_id, position, description, unit, quantity, unit_price, direct_class, created_by) values
  ((select v from ids where k = 'bud'), (select v from ids where k = 'var'), 1, 'Limpieza final de obra', 'gl', 1, 250000.5, 'other',
   '22222222-2222-2222-2222-222222222222'),
  ((select v from ids where k = 'bud'), (select v from ids where k = 'ele'), 1, 'Instalación eléctrica completa', 'gl', 1, 1800000, 'subcontract',
   '22222222-2222-2222-2222-222222222222');
insert into ids select 'muro', id from public.budget_items where description = 'Muro de 18 cm';

-- Muro: 12,5 × (1000 materiales, 1000 mano de obra, 1,50 USD × 1000 de equipo).
select results_eq(
  $$ select materials, labor, equipment, subcontract, other, total from public.budget_item_costs
     where item_id = (select v from ids where k = 'muro') $$,
  $$ values (12500.00::numeric, 12500.00::numeric, 18750.00::numeric, 0.00::numeric, 0.00::numeric, 43750.00::numeric) $$,
  'Un ítem por análisis se separa en partes; el equipo en dólares se pasa con el tipo de cambio');
select is((select subcontract from public.budget_item_costs ic join public.budget_items i on i.id = ic.item_id
           where i.description = 'Tabique subcontratado'), 35000.00::numeric,
  'Un ítem subcontratado va entero a subcontratos (10 × 3500)');
select results_eq(
  $$ select materials, labor, equipment, subcontract, other, total, items from public.budget_totals
     where budget_id = (select v from ids where k = 'bud') $$,
  $$ values (12500.00::numeric, 12500.00::numeric, 18750.00::numeric, 1835000.00::numeric, 250000.50::numeric,
             2128750.50::numeric, 4) $$,
  'Totales del presupuesto con el desglose');
select is((select materials + labor + equipment + subcontract + other - total from public.budget_totals
           where budget_id = (select v from ids where k = 'bud')), 0.00::numeric,
  'La suma de las partes da el total al centavo');
select is((select cost_per_m2 from public.budget_totals where budget_id = (select v from ids where k = 'bud')), 21287.51::numeric,
  'El costo por m² usa los m² de la ficha (2.128.750,50 ÷ 100)');

-- Las cuentas con cantidades y precios con decimales también cierran.
insert into public.budget_items (budget_id, chapter_id, position, description, unit, quantity, unit_price, direct_class, created_by) values
  ((select v from ids where k = 'bud'), (select v from ids where k = 'var'), 2, 'Flete', 'viaje', 3.333, 1234.5678, 'materials',
   '22222222-2222-2222-2222-222222222222');
select is((select materials + labor + equipment + subcontract + other - total from public.budget_totals
           where budget_id = (select v from ids where k = 'bud')), 0.00::numeric,
  'Sigue cerrando al centavo con cantidades y precios con decimales');
select is((select total from public.budget_item_costs ic join public.budget_items i on i.id = ic.item_id where i.description = 'Flete'),
  4114.81::numeric, 'Cada línea se redondea al centavo (3,333 × 1234,5678)');
delete from public.budget_items where description = 'Flete';

-- Cambia solo con el precio del insumo.
select public.upsert_supply((select v from ids where k = 'org_a'), (select v from ids where k = 'mat'), 'material', 'MAT', 'Material', 'u', 'ARS', 120, '2026-11-12');
select is((select materials from public.budget_item_costs where item_id = (select v from ids where k = 'muro')), 15000.00::numeric,
  'Al cambiar el precio de un insumo, el ítem cambia solo (12,5 × 1200)');

-- Sin tipo de cambio, lo que está en dólares no se valoriza y se avisa.
select public.set_budget_exchange_rate((select v from ids where k = 'bud'), null);
select results_eq(
  $$ select total, items_missing_rate from public.budget_totals where budget_id = (select v from ids where k = 'bud') $$,
  $$ values (2050000.50::numeric, 2) $$,
  'Sin tipo de cambio, los ítems con partes en dólares no suman y se cuentan aparte');
select public.set_budget_exchange_rate((select v from ids where k = 'bud'), 1000);
select throws_ok($$ select public.set_budget_exchange_rate((select v from ids where k = 'bud'), 0) $$,
  '23514', null, 'El tipo de cambio tiene que ser mayor que cero');

insert into public.budget_items (budget_id, chapter_id, position, description, unit, quantity, analysis_id, created_by) values
  ((select v from ids where k = 'bud'), (select v from ids where k = 'var'), 3, 'Con un insumo sin precio', 'm2', 1,
   (select v from ids where k = 'apu_np'), '22222222-2222-2222-2222-222222222222');
select is((select items_unpriced from public.budget_totals where budget_id = (select v from ids where k = 'bud')), 1,
  'El presupuesto avisa si usa insumos sin precio');

-- Validaciones ---------------------------------------------------------------------------
select throws_ok($$ insert into public.budget_items (budget_id, chapter_id, description, unit, quantity, analysis_id, unit_price, direct_class, created_by)
  values ((select v from ids where k = 'bud'), (select v from ids where k = 'var'), 'Las dos cosas', 'u', 1,
          (select v from ids where k = 'apu'), 10, 'other', '22222222-2222-2222-2222-222222222222') $$,
  '23514', null, 'Un ítem se valoriza por análisis o por precio directo, no por los dos');
select throws_ok($$ insert into public.budget_items (budget_id, chapter_id, description, unit, quantity, unit_price, direct_class, created_by)
  values ((select v from ids where k = 'bud'), (select v from ids where k = 'var'), 'Cantidad cero', 'u', 0, 10, 'other',
          '22222222-2222-2222-2222-222222222222') $$,
  '23514', null, 'La cantidad tiene que ser mayor que cero');
select throws_ok($$ insert into public.budget_items (budget_id, chapter_id, description, unit, quantity, unit_price, direct_class, created_by)
  values ((select v from ids where k = 'bud'), (select id from public.budget_chapters where budget_id <> (select v from ids where k = 'bud') limit 1),
          'Rubro ajeno', 'u', 1, 10, 'other', '22222222-2222-2222-2222-222222222222') $$,
  '23514', null, 'El rubro tiene que ser de este presupuesto');

select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333"}', true);
with x as (
  insert into public.unit_analyses (org_id, code, name, unit, chapter, created_by)
  values ((select v from ids where k = 'org_b'), 'AJENO', 'De otra organización', 'm2', 'Varios', '33333333-3333-3333-3333-333333333333')
  returning id)
insert into ids select 'apu_b', id from x;
select is((select count(*)::int from public.budget_items), 0, 'Otra organización no ve los ítems');
select is((select count(*)::int from public.budget_item_costs), 0, 'Ni sus costos');
select throws_ok($$ insert into public.budget_items (budget_id, chapter_id, description, unit, quantity, unit_price, direct_class, created_by)
  values ((select v from ids where k = 'bud'), (select v from ids where k = 'var'), 'Intruso', 'u', 1, 10, 'other',
          '33333333-3333-3333-3333-333333333333') $$,
  '42501', null, 'Ni agrega ítems a un presupuesto ajeno');

select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222"}', true);
select throws_ok($$ insert into public.budget_items (budget_id, chapter_id, description, unit, quantity, analysis_id, created_by)
  values ((select v from ids where k = 'bud'), (select v from ids where k = 'var'), 'Análisis ajeno', 'u', 1,
          (select v from ids where k = 'apu_b'), '22222222-2222-2222-2222-222222222222') $$,
  '23514', null, 'No acepta análisis de otra organización');

-- Orden y rubros ------------------------------------------------------------------------
select public.move_budget_row('item', (select id from public.budget_items where description = 'Tabique subcontratado'), -1);
select is((select array_agg(description order by position) from public.budget_items where chapter_id = (select v from ids where k = 'mam')),
  array['Tabique subcontratado', 'Muro de 18 cm'], 'Los ítems se reordenan');
select public.move_budget_row('chapter', (select v from ids where k = 'var'), -1);
select is((select name from public.budget_chapters where budget_id = (select v from ids where k = 'bud') order by position desc limit 1),
  'Pinturas', 'Los rubros también');
select throws_ok($$ delete from public.budget_chapters where id = (select v from ids where k = 'mam') $$,
  '23503', null, 'Un rubro con ítems no se borra');
select lives_ok($$ delete from public.budget_chapters where budget_id = (select v from ids where k = 'bud') and name = 'Cubiertas' $$,
  'Un rubro vacío se borra');

-- Solo en borrador ----------------------------------------------------------------------
reset role;
update public.budgets set status = 'sent' where id = (select v from ids where k = 'bud');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222"}', true);
select throws_ok($$ update public.budget_items set quantity = 99 where id = (select v from ids where k = 'muro') $$,
  '22023', null, 'Fuera de borrador no se edita un ítem');
select throws_ok($$ delete from public.budget_items where id = (select v from ids where k = 'muro') $$,
  '22023', null, 'Ni se borra');
select throws_ok($$ insert into public.budget_chapters (budget_id, name) values ((select v from ids where k = 'bud'), 'Nuevo rubro') $$,
  '22023', null, 'Ni se agregan rubros');
select throws_ok($$ select public.set_budget_exchange_rate((select v from ids where k = 'bud'), 1100) $$,
  '22023', null, 'Ni cambia el tipo de cambio');
select throws_ok($$ insert into public.budget_chapters (budget_id, name)
  values ((select id from public.budgets where project_id = (select v from ids where k = 'p1') and level = 'parametric'), 'Rubro') $$,
  '22023', null, 'Una estimación paramétrica no tiene rubros');

-- La estimación paramétrica sigue igual con la vista rehecha.
select results_eq(
  $$ select number, total, cost_per_m2 from public.budget_totals where project_id = (select v from ids where k = 'p1') and level = 'parametric' $$,
  $$ values (1, 150000000.00::numeric, 1500000.00::numeric) $$,
  'La estimación paramétrica da lo mismo que antes');
select is((select number from public.latest_budget_totals where project_id = (select v from ids where k = 'p1')), 2,
  'La última versión es el presupuesto por ítem');
reset role;

select * from finish();
rollback;
