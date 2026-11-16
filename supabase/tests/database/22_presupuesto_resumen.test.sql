-- Finanzas de obra · Sprint 7 · Personal e indirectos, honorarios y pase: el resumen del precio.
begin;
create extension if not exists pgtap with schema extensions;
select plan(33);

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
-- Honorarios del proyecto: una etapa en dólares y otra en pesos.
insert into public.fee_stages (org_id, project_id, name, currency, amount, created_by)
select o.v, p.v, 'Proyecto', 'USD', 1000, '11111111-1111-1111-1111-111111111111'
from ids o, ids p where o.k = 'org_a' and p.k = 'p1';
insert into public.fee_stages (org_id, project_id, name, currency, amount, created_by)
select o.v, p.v, 'Dirección de obra', 'ARS', 50000, '11111111-1111-1111-1111-111111111111'
from ids o, ids p where o.k = 'org_a' and p.k = 'p1';
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333"}', true);
insert into ids values ('org_b', public.create_organization('Constructora B'));
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222"}', true);
select public.claim_invitations();
reset role;
update public.organizations set beta_features = '{works}' where id in (select v from ids where k in ('org_a', 'org_b'));
insert into public.exchange_rates (org_id, rate_date, source, rate, created_by)
select v, '2026-11-10', 'official', 1000, '11111111-1111-1111-1111-111111111111' from ids where k = 'org_a';

-- Ficha en pesos: 100 m² cubiertos, edificio de viviendas, 7 meses de obra.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222"}', true);
select public.upsert_work((select v from ids where k = 'p1'), 'builder', null, null, 100, 0, 'multifamily',
  'standard', '2027-03-01', '2027-09-15', 'ARS');
select * from public.create_parametric_budget((select v from ids where k = 'p1'), 1500000, '2026-11-01', 'Costo propio');
insert into ids select 'b1', id from public.create_item_budget((select v from ids where k = 'p1'), 'by_item', false);
insert into ids select 'par', id from public.budgets where project_id = (select v from ids where k = 'p1') and level = 'parametric';

-- Costo directo: 10 × ARS 1.000 de materiales y 2 × ARS 2.500 de mano de obra = ARS 15.000.
with c as (
  insert into public.budget_chapters (budget_id, name) values ((select v from ids where k = 'b1'), 'Varios') returning id)
insert into ids select 'ch', id from c;
insert into public.budget_items (budget_id, chapter_id, description, unit, quantity, unit_price, direct_class, created_by)
values
  ((select v from ids where k = 'b1'), (select v from ids where k = 'ch'), 'Materiales', 'u', 10, 1000, 'materials', '22222222-2222-2222-2222-222222222222'),
  ((select v from ids where k = 'b1'), (select v from ids where k = 'ch'), 'Oficial', 'h', 2, 2500, 'labor', '22222222-2222-2222-2222-222222222222');

-- 1. Sin indirectos ni pase, el precio es el costo directo.
select is((select price from public.budget_totals where budget_id = (select v from ids where k = 'b1')), 15000.00::numeric,
  'Sin indirectos, pase ni honorarios, el precio es el costo directo');

-- 2-6. Plantilla de personal e indirectos: por los meses de la ficha, sin costos.
select is(public.apply_overhead_template((select v from ids where k = 'b1')), 5,
  'La plantilla de un edificio carga jefe de obra, capataz, sereno, obrador y seguros');
select is((select array_agg(distinct months) from public.budget_overheads where budget_id = (select v from ids where k = 'b1')),
  array[7.00]::numeric[], 'Con los meses de obra de la ficha (1/3 al 15/9: 7 meses)');
select is((select overheads_unpriced from public.budget_totals where budget_id = (select v from ids where k = 'b1')), 5,
  'Los conceptos de la plantilla quedan sin costo y se avisan');
select is((select cost from public.budget_totals where budget_id = (select v from ids where k = 'b1')), 15000.00::numeric,
  'Un indirecto sin costo no suma');
select throws_ok($$ select public.apply_overhead_template((select v from ids where k = 'b1')) $$,
  '22023', null, 'La plantilla se carga una sola vez');

-- 7-9. Costos: capataz 2 × 1.500 (personal) y seguros 1,5 × 1.000 (indirectos); el resto se borra.
delete from public.budget_overheads where budget_id = (select v from ids where k = 'b1') and concept not in ('Capataz', 'Seguros (ART, responsabilidad civil y todo riesgo)');
update public.budget_overheads set months = 2, monthly_cost = 1500 where budget_id = (select v from ids where k = 'b1') and concept = 'Capataz';
update public.budget_overheads set months = 1.5, monthly_cost = 1000 where budget_id = (select v from ids where k = 'b1') and kind = 'indirect';
select results_eq(
  $$ select overheads_staff, overheads_indirect, overheads_unpriced, cost from public.budget_totals where budget_id = (select v from ids where k = 'b1') $$,
  $$ values (3000.00::numeric, 1500.00::numeric, 0, 19500.00::numeric) $$,
  'Personal 3.000 e indirectos 1.500: costo 19.500');
select throws_ok(
  $$ insert into public.budget_overheads (budget_id, kind, concept, months, created_by)
     values ((select v from ids where k = 'par'), 'staff', 'Capataz', 1, '22222222-2222-2222-2222-222222222222') $$,
  '22023', null, 'Una estimación paramétrica no tiene indirectos');
select throws_ok(
  $$ insert into public.budget_overheads (budget_id, kind, concept, months, created_by)
     values ((select v from ids where k = 'b1'), 'staff', 'Capataz', 0, '22222222-2222-2222-2222-222222222222') $$,
  '23514', null, 'Los meses tienen que ser más que cero');

-- 10-13. Pase en cascada: GG 10 %, beneficio 15 %, impuestos 5 %.
--   GG = 19.500 × 10 % = 1.950 · B = 21.450 × 15 % = 3.217,50 · I = 24.667,50 × 5 % = 1.233,38
select public.set_budget_markup((select v from ids where k = 'b1'), 10, 15, 5, 'cascade');
select results_eq(
  $$ select overhead_amount, profit_amount, tax_amount, markup_amount, price
     from public.budget_totals where budget_id = (select v from ids where k = 'b1') $$,
  $$ values (1950.00::numeric, 3217.50::numeric, 1233.38::numeric, 6400.88::numeric, 25900.88::numeric) $$,
  'En cascada, cada porcentaje va sobre el subtotal anterior');
select public.set_budget_markup((select v from ids where k = 'b1'), 10, 15, 5, 'on_cost');
select results_eq(
  $$ select overhead_amount, profit_amount, tax_amount, price from public.budget_totals where budget_id = (select v from ids where k = 'b1') $$,
  $$ values (1950.00::numeric, 2925.00::numeric, 975.00::numeric, 25350.00::numeric) $$,
  'Sobre el costo, los tres porcentajes van sobre el costo');
select throws_ok($$ select public.set_budget_markup((select v from ids where k = 'b1'), 10, 15, 5, 'otro') $$,
  '22023', null, 'El método es cascada o sobre el costo');
select throws_ok($$ select public.set_budget_markup((select v from ids where k = 'b1'), -1, 15, 5, 'cascade') $$,
  '23514', null, 'Un porcentaje no puede ser negativo');
select public.set_budget_markup((select v from ids where k = 'b1'), 10, 15, 5, 'cascade');

-- 14-17. Honorarios por horas: 100 h × ARS 250 = ARS 25.000, en su propia línea.
select is(public.set_budget_fees((select v from ids where k = 'b1'), 'hours', 100, 250), 25000.00::numeric,
  'Honorarios por horas: horas × costo por hora');
select results_eq(
  $$ select fees_mode, fees_amount, price, price_per_m2 from public.budget_totals where budget_id = (select v from ids where k = 'b1') $$,
  $$ values ('hours'::text, 25000.00::numeric, 50900.88::numeric, 509.01::numeric) $$,
  'Los honorarios se suman después del pase: precio 50.900,88 y 509,01 por m²');
select is((select markup_amount from public.budget_totals where budget_id = (select v from ids where k = 'b1')), 6400.88::numeric,
  'El pase no se aplica sobre los honorarios');
select throws_ok($$ select public.set_budget_fees((select v from ids where k = 'b1'), 'hours', null, 250) $$,
  '23514', null, 'Por horas hacen falta las horas y el costo por hora');

-- 18-21. Honorarios de las etapas: USD 1.000 × 1.000 + ARS 50.000 = ARS 1.050.000, foto del momento.
select is(public.set_budget_fees((select v from ids where k = 'b1'), 'stages'), 1050000.00::numeric,
  'De las etapas: se pasan a la moneda del presupuesto con su tipo de cambio');
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', true);
update public.fee_stages set amount = 2000 where name = 'Proyecto';
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222"}', true);
select is((select fees_amount from public.budget_totals where budget_id = (select v from ids where k = 'b1')), 1050000.00::numeric,
  'El monto tomado no sigue los cambios de las etapas');
select public.set_budget_exchange_rate((select v from ids where k = 'b1'), null);
select throws_ok($$ select public.set_budget_fees((select v from ids where k = 'b1'), 'stages') $$,
  '22023', 'Cargá el tipo de cambio del presupuesto para pasar los honorarios en USD',
  'Sin tipo de cambio no se pasan honorarios en otra moneda');
select public.set_budget_exchange_rate((select v from ids where k = 'b1'), 1000);
select is(public.set_budget_fees((select v from ids where k = 'b1'), 'stages'), 2050000.00::numeric,
  'Al volver a tomarlos, toma el honorario actual');

-- 22-23. Sin honorarios.
select is(public.set_budget_fees((select v from ids where k = 'b1'), 'none'), null::numeric, 'Se pueden quitar los honorarios');
select is((select price from public.budget_totals where budget_id = (select v from ids where k = 'b1')), 25900.88::numeric,
  'Sin honorarios, el precio es costo más pase');

-- 24-25. El paramétrico no cambia: su precio es su total y no se le aplica pase.
select is((select price from public.budget_totals where budget_id = (select v from ids where k = 'par')),
  (select total from public.budget_totals where budget_id = (select v from ids where k = 'par')),
  'El precio de un paramétrico es su total');
select throws_ok($$ select public.set_budget_markup((select v from ids where k = 'par'), 10, 10, 10, 'cascade') $$,
  '22023', null, 'Un paramétrico no tiene pase');

-- 26-27. Eventos para el historial del proyecto.
select ok(exists (select 1 from public.events where type = 'budget.markup_changed' and data->>'project_id' = (select v from ids where k = 'p1')::text),
  'Cambiar el pase queda en el historial del proyecto');
select ok(exists (select 1 from public.events where type = 'budget.fees_set' and data->>'mode' = 'stages'),
  'Tomar los honorarios queda en el historial');

-- 28-31. Otra organización no ve ni toca nada.
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333"}', true);
select is_empty($$ select 1 from public.budget_overheads where budget_id = (select v from ids where k = 'b1') $$,
  'B no ve los indirectos de A');
select throws_ok($$ select public.set_budget_markup((select v from ids where k = 'b1'), 1, 1, 1, 'cascade') $$,
  '42501', null, 'B no cambia el pase de A');
select throws_ok($$ select public.set_budget_fees((select v from ids where k = 'b1'), 'none') $$,
  '42501', null, 'B no cambia los honorarios de A');
select is_empty($$ update public.budget_overheads set months = 9 where budget_id = (select v from ids where k = 'b1') returning id $$,
  'B no edita los indirectos de A');

-- 32-33. Un presupuesto que dejó el borrador no se toca.
reset role;
update public.budgets set status = 'sent' where id = (select v from ids where k = 'b1');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222"}', true);
select throws_ok($$ update public.budget_overheads set months = 9 where budget_id = (select v from ids where k = 'b1') $$,
  '22023', null, 'Fuera de borrador no se editan los indirectos');
select throws_ok($$ select public.set_budget_markup((select v from ids where k = 'b1'), 1, 1, 1, 'cascade') $$,
  '22023', null, 'Fuera de borrador no se cambia el pase');

select * from finish();
rollback;
