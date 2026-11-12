-- Revisión · Vistas de resumen: dan lo mismo que las tablas, respetan la RLS.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'ana@estudio-a.com'),     -- dueña A
  ('22222222-2222-2222-2222-222222222222', 'beto@estudio-a.com'),    -- miembro A
  ('33333333-3333-3333-3333-333333333333', 'bruno@estudio-b.com'),   -- dueño B
  ('55555555-5555-5555-5555-555555555555', 'admin@plataforma.com');  -- plataforma
insert into public.platform_admins (user_id) values ('55555555-5555-5555-5555-555555555555');
delete from public.reference_value_revisions;
delete from public.reference_values;

create temp table ids (k text primary key, v uuid);
grant select, insert, update on ids to public;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', true);
insert into ids values ('org_a', public.create_organization('Estudio A'));
with x as (
  insert into public.projects (org_id, name, created_by)
  select v, 'Edificio Alba', '11111111-1111-1111-1111-111111111111' from ids where k = 'org_a'
  returning id)
insert into ids select 'p1', id from x;
select public.apply_fee_template((select v from ids where k = 'p1'), 'USD');
update public.fee_stages set amount = 1000 where project_id = (select v from ids where k = 'p1');
select public.invite_member((select v from ids where k = 'org_a'), 'beto@estudio-a.com', 'member');
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333"}', true);
insert into ids values ('org_b', public.create_organization('Estudio B'));
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222"}', true);
select public.claim_invitations();
reset role;
update public.organizations set beta_features = '{works}' where id = (select v from ids where k = 'org_a');

-- Series ----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"55555555-5555-5555-5555-555555555555"}', true);
select * from public.load_reference_values('cac_general',
  '[{"period":"2026-06-01","value":100},{"period":"2026-07-01","value":104},{"period":"2026-08-01","value":110,"provisional":true}]');

select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', true);
select results_eq(
  $$ select months, provisional_months, last_period, last_value, last_provisional
     from public.reference_series_summary where code = 'cac_general' $$,
  $$ values (3, 1, '2026-08-01'::date, 110.0000::numeric, true) $$,
  'El resumen de la serie da los meses, los provisorios y el último valor');
select results_eq(
  $$ select months, last_period from public.reference_series_summary where code = 'icc_cordoba' $$,
  $$ values (0, null::date) $$,
  'Una serie sin valores aparece igual, en cero');
select is((select count(*)::int from public.reference_series_summary), 9, 'El resumen trae todas las series');

-- Historial de índices --------------------------------------------------------------
select public.adopt_reference_series((select v from ids where k = 'org_a'), 'cac_general', 'CAC');
insert into public.price_indices (org_id, name, period, value, created_by)
values ((select v from ids where k = 'org_a'), 'Propio', '2026-08-01', 50, '11111111-1111-1111-1111-111111111111');
select results_eq(
  $$ select period, value, previous_value, recency, months, provisional
     from public.price_index_history where name = 'CAC' order by period desc $$,
  $$ values ('2026-08-01'::date, 110.0000::numeric, 104.0000::numeric, 1, 3, true),
            ('2026-07-01'::date, 104.0000::numeric, 100.0000::numeric, 2, 3, false),
            ('2026-06-01'::date, 100.0000::numeric, null::numeric, 3, 3, false) $$,
  'El historial trae el orden, el mes anterior y la cantidad de meses');
select results_eq(
  $$ select name, adopted, months from public.price_index_names order by name $$,
  $$ values ('CAC'::text, true, 3), ('Propio'::text, false, 1) $$,
  'Un renglón por índice, con si viene de una serie');

select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333"}', true);
select is((select count(*)::int from public.price_index_history), 0, 'Otro estudio no ve el historial ajeno');
select is((select count(*)::int from public.price_index_names), 0, 'Ni los nombres de sus índices');

-- Última versión de presupuesto ------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', true);
select public.upsert_work((select v from ids where k = 'p1'), 'works_director', null, null,
  100, 0, 'single_family', 'standard', null, null, 'USD');
select * from public.create_parametric_budget((select v from ids where k = 'p1'), 1000, '2026-10-01', 'Costo propio');
select * from public.create_parametric_budget((select v from ids where k = 'p1'), 1200, '2026-11-01', 'Costo propio');
select results_eq(
  $$ select number, total from public.latest_budget_totals where project_id = (select v from ids where k = 'p1') $$,
  $$ values (2, 120000.00::numeric) $$,
  'Solo la última versión de cada proyecto');
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333"}', true);
select is((select count(*)::int from public.latest_budget_totals), 0, 'Otro estudio no ve presupuestos ajenos');

-- Rentabilidad por proyecto ----------------------------------------------------------
reset role;
insert into public.time_entries (stage_id, user_id, work_date, hours)
select id, '11111111-1111-1111-1111-111111111111', '2026-10-01', 2
from public.fee_stages where project_id = (select v from ids where k = 'p1');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', true);
insert into public.member_costs (org_id, user_id, hourly_cost, currency, valid_from, created_by)
values ((select v from ids where k = 'org_a'), '11111111-1111-1111-1111-111111111111', 10, 'USD', '2026-01-01',
        '11111111-1111-1111-1111-111111111111');
select is(
  (select profit from public.project_profitability where project_id = (select v from ids where k = 'p1')),
  (select sum(profit) from public.stage_profitability where project_id = (select v from ids where k = 'p1')),
  'La rentabilidad del proyecto es la suma de sus etapas');
select is(
  (select income - cost from public.project_profitability where project_id = (select v from ids where k = 'p1')),
  (select profit from public.project_profitability where project_id = (select v from ids where k = 'p1')),
  'Resultado = ingreso − costo');
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222"}', true);
select is((select count(*)::int from public.project_profitability), 0, 'A un miembro la rentabilidad le devuelve vacío');
reset role;

select * from finish();
rollback;
