-- Finanzas de obra · Sprint 2 · Series de referencia, adopción y tipo de cambio.
begin;
create extension if not exists pgtap with schema extensions;
select plan(33);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'ana@estudio-a.com'),     -- dueña A
  ('22222222-2222-2222-2222-222222222222', 'beto@estudio-a.com'),    -- miembro A
  ('33333333-3333-3333-3333-333333333333', 'bruno@estudio-b.com'),   -- dueño B
  ('55555555-5555-5555-5555-555555555555', 'admin@plataforma.com');  -- plataforma
insert into public.platform_admins (user_id) values ('55555555-5555-5555-5555-555555555555');
-- La prueba parte de series vacías aunque la base tenga el seed (vuelve todo atrás al final).
delete from public.reference_value_revisions;
delete from public.reference_values;

create temp table ids (k text primary key, v uuid);
grant select, insert, update on ids to public;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', true);
insert into ids values ('org_a', public.create_organization('Estudio A'));
with x as (
  insert into public.projects (org_id, name, created_by)
  select v, 'Casa Norte', '11111111-1111-1111-1111-111111111111' from ids where k = 'org_a'
  returning id)
insert into ids select 'p1', id from x;
select public.invite_member((select v from ids where k = 'org_a'), 'beto@estudio-a.com', 'member');
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333"}', true);
insert into ids values ('org_b', public.create_organization('Estudio B'));
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222"}', true);
select public.claim_invitations();

-- Series: las leen todos; las escribe solo la plataforma ----------------------------
select is((select count(*)::int from public.reference_series), 9, 'Hay 9 series iniciales');
select is(public.am_platform_admin(), false, 'Un miembro de estudio no administra la plataforma');

select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', true);
select throws_ok($$ select * from public.load_reference_values('cac_general', '[{"period":"2026-06-01","value":100}]') $$,
  '42501', null, 'La dueña de un estudio no carga series de referencia');
select throws_ok($$ insert into public.reference_values (series_code, period, value) values ('cac_general', '2026-06-01', 100) $$,
  '42501', null, 'Nadie escribe valores directo en la tabla');

select set_config('request.jwt.claims', '{"sub":"55555555-5555-5555-5555-555555555555"}', true);
select is(public.am_platform_admin(), true, 'La plataforma se reconoce como tal');
select results_eq(
  $$ select * from public.load_reference_values('cac_general',
       '[{"period":"2026-06-01","value":100},{"period":"2026-07-01","value":104},{"period":"2026-08-01","value":108}]') $$,
  $$ values (3, 0, 0) $$, 'La plataforma carga tres meses');
select throws_ok($$ select * from public.load_reference_values('cac_general', '[{"period":"2026-09-15","value":100}]') $$,
  '22023', null, 'Un período que no es el primer día del mes se rechaza');
select throws_ok($$ select * from public.load_reference_values('cac_general', '[{"period":"2026-09-01","value":0}]') $$,
  '22023', null, 'Un valor cero se rechaza');
select throws_ok($$ select * from public.load_reference_values('no_existe', '[{"period":"2026-09-01","value":1}]') $$,
  '22023', null, 'Una serie inexistente se rechaza');

select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333"}', true);
select is((select count(*)::int from public.reference_values where series_code = 'cac_general'), 3,
  'Cualquier usuario lee los valores de referencia');

-- Adopción -------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222"}', true);
select throws_ok($$ select public.adopt_reference_series((select v from ids where k = 'org_a'), 'cac_general', 'CAC') $$,
  '42501', null, 'Un miembro no adopta series');

select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', true);
select is(public.adopt_reference_series((select v from ids where k = 'org_a'), 'cac_general', 'CAC'), 3,
  'La dueña adopta la CAC y se copian los tres meses');
select is((select count(*)::int from public.price_indices
           where org_id = (select v from ids where k = 'org_a') and name = 'CAC' and reference_series_code = 'cac_general'), 3,
  'El historial queda en price_indices con el nombre local');
select throws_ok($$ select public.adopt_reference_series((select v from ids where k = 'org_a'), 'cac_general', 'CAC 2') $$,
  '23505', null, 'No se adopta dos veces la misma serie');
select throws_ok($$ insert into public.price_indices (org_id, name, period, value, created_by)
  values ((select v from ids where k = 'org_a'), 'CAC', '2026-09-01', 150, '11111111-1111-1111-1111-111111111111') $$,
  '42501', null, 'Un índice adoptado no se carga a mano');
select throws_ok($$ update public.price_indices set value = 1 where name = 'CAC' $$,
  '42501', null, 'Un índice adoptado no se corrige a mano');
select throws_ok($$ delete from public.price_indices where name = 'CAC' $$,
  '42501', null, 'Un índice adoptado no se borra a mano');

-- Etapa ajustada por la serie adoptada, base junio.
select public.apply_fee_template((select v from ids where k = 'p1'), 'USD');
update public.fee_stages set amount = 1000, index_name = 'CAC', index_base_period = '2026-06-01'
where id = (select id from public.fee_stages where project_id = (select v from ids where k = 'p1') order by position limit 1);
insert into ids select 's1', id from public.fee_stages where project_id = (select v from ids where k = 'p1') and index_name = 'CAC';
select is((select fee_adjusted from public.fee_stage_summary where id = (select v from ids where k = 's1')), 1080.00::numeric,
  'La etapa se ajusta con la serie adoptada (1000 × 108 ÷ 100)');

-- Un índice cargado a mano con el mismo nombre: hay que pedir reemplazarlo.
insert into public.price_indices (org_id, name, period, value, created_by)
values ((select v from ids where k = 'org_a'), 'ICC Córdoba', '2026-01-01', 99, '11111111-1111-1111-1111-111111111111');
select throws_ok($$ select public.adopt_reference_series((select v from ids where k = 'org_a'), 'icc_cordoba', 'ICC Córdoba') $$,
  '23505', null, 'Si ya hay un índice a mano con ese nombre, no se pisa sin pedirlo');
select is(public.adopt_reference_series((select v from ids where k = 'org_a'), 'icc_cordoba', 'ICC Córdoba', true), 0,
  'Con reemplazo, se adopta (la serie todavía no tiene valores)');
select is((select count(*)::int from public.price_indices where name = 'ICC Córdoba'), 0,
  'Los valores cargados a mano se reemplazaron');

-- Propagación y rectificación ------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"55555555-5555-5555-5555-555555555555"}', true);
select results_eq(
  $$ select * from public.load_reference_values('cac_general',
       '[{"period":"2026-08-01","value":109,"note":"Corrige el dato publicado"},{"period":"2026-09-01","value":112,"provisional":true}]') $$,
  $$ values (1, 1, 0) $$, 'Septiembre entra como provisorio y agosto se rectifica');
select results_eq(
  $$ select * from public.load_reference_values('cac_general', '[{"period":"2026-09-01","value":112,"provisional":true}]') $$,
  $$ values (0, 0, 1) $$, 'Cargar el mismo valor no cambia nada');
select results_eq(
  $$ select old_value, new_value, note from public.reference_value_revisions where series_code = 'cac_general' $$,
  $$ values (108.0000::numeric, 109.0000::numeric, 'Corrige el dato publicado'::text) $$,
  'La rectificación guarda el valor anterior');

select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', true);
select results_eq(
  $$ select period, value, provisional from public.price_indices where name = 'CAC' and period >= '2026-08-01' order by period $$,
  $$ values ('2026-08-01'::date, 109.0000::numeric, false), ('2026-09-01'::date, 112.0000::numeric, true) $$,
  'Los valores nuevos y rectificados llegan al estudio que adoptó la serie');
select is((select fee_adjusted from public.fee_stage_summary where id = (select v from ids where k = 's1')), 1120.00::numeric,
  'La etapa toma el último valor (1000 × 112 ÷ 100)');
select is((select (data -> 'before' ->> 'value')::numeric from public.events
           where type = 'price_index.updated' and data -> 'after' ->> 'name' = 'CAC'), 108.0000::numeric,
  'El estudio ve la rectificación en su registro, con el valor anterior');
select is((select count(*)::int from public.reference_value_revisions), 0, 'Las rectificaciones las ve solo la plataforma');

select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333"}', true);
select is((select count(*)::int from public.org_reference_series), 0, 'Otro estudio no ve qué series adoptó el primero');

-- Tipo de cambio --------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222"}', true);
select throws_ok($$ insert into public.exchange_rates (org_id, rate_date, source, rate, created_by)
  values ((select v from ids where k = 'org_a'), '2026-11-01', 'official', 1000, '22222222-2222-2222-2222-222222222222') $$,
  '42501', null, 'Un miembro no carga el tipo de cambio');

select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', true);
insert into public.exchange_rates (org_id, rate_date, source, rate, created_by) values
  ((select v from ids where k = 'org_a'), '2026-11-02', 'official', 1000, '11111111-1111-1111-1111-111111111111'),
  ((select v from ids where k = 'org_a'), '2026-11-05', 'official', 1050, '11111111-1111-1111-1111-111111111111'),
  ((select v from ids where k = 'org_a'), '2026-11-04', 'mep', 1200, '11111111-1111-1111-1111-111111111111');
select results_eq(
  $$ select public.exchange_rate_at((select v from ids where k = 'org_a'), 'USD', d::date, 'official')
     from (values ('2026-11-01'), ('2026-11-04'), ('2026-11-05'), ('2026-12-31')) t (d) $$,
  $$ values (null::numeric), (1000.0000::numeric), (1050.0000::numeric), (1050.0000::numeric) $$,
  'Se usa el último valor anterior o igual a la fecha, de la misma fuente');
select throws_ok($$ insert into public.exchange_rates (org_id, rate_date, source, rate, created_by)
  values ((select v from ids where k = 'org_a'), '2026-11-05', 'official', 1060, '11111111-1111-1111-1111-111111111111') $$,
  '23505', null, 'Un valor por moneda, fecha y fuente');

select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333"}', true);
select is(public.exchange_rate_at((select v from ids where k = 'org_a'), 'USD', '2026-11-05', 'official'), null,
  'Otro estudio no lee el tipo de cambio ajeno');
reset role;

select * from finish();
rollback;
