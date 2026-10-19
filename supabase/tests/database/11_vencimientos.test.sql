-- Sprint 5 · Vencimientos: un aviso por umbral.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'ana@estudio-a.com'),
  ('33333333-3333-3333-3333-333333333333', 'bruno@estudio-b.com');

create temp table ids (k text primary key, v uuid);
create temp table hoy as select (now() at time zone 'America/Argentina/Cordoba')::date as d;
grant select, insert, update on ids, hoy to public;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333"}', true);
insert into ids values ('org_b', public.create_organization('Estudio B'));
with x as (
  insert into public.projects (org_id, name, created_by)
  select v, 'Ajeno', '33333333-3333-3333-3333-333333333333' from ids where k = 'org_b' returning id)
insert into ids select 'pb', id from x;

select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', true);
insert into ids values ('org_a', public.create_organization('Estudio A'));
with x as (
  insert into public.projects (org_id, name, created_by)
  select v, 'Edificio Alba', '11111111-1111-1111-1111-111111111111' from ids where k = 'org_a' returning id)
insert into ids select 'p1', id from x;

select lives_ok($$ insert into ids values ('v1', public.create_deadline((select v from ids where k = 'org_a'),
  (select v from ids where k = 'p1'), 'Presentación municipal', (select d + 40 from hoy))) $$,
  'La dueña carga un vencimiento a 40 días con avisos a 30, 15 y 5');
select throws_ok($$ select public.create_deadline((select v from ids where k = 'org_a'), null, 'Mal', (select d + 9 from hoy), '{0}') $$,
  '23514', null, 'Los días de aviso van de 1 a 365');
select throws_ok($$ select public.create_deadline((select v from ids where k = 'org_a'), (select v from ids where k = 'pb'), 'Ajeno', (select d from hoy)) $$,
  '42501', null, 'No se cuelga un vencimiento de un proyecto de otro estudio');
select throws_ok($$ select public.process_deadline_alerts() $$, '42501', null, 'El job no lo corre cualquiera');

reset role;
select is(public.process_deadline_alerts((select d from hoy)), 0, 'Hoy faltan 40 días: no hay aviso');
select is(public.process_deadline_alerts((select d + 10 from hoy)), 1, 'Faltando 30 días sale el primer aviso');
select is(public.process_deadline_alerts((select d + 10 from hoy)), 0, 'Ese aviso no se repite');
select is((select count(*)::int from public.outbox where kind = 'deadline_alert' and org_id = (select v from ids where k = 'org_a')), 1,
  'Un solo correo a la dueña');
select is(public.process_deadline_alerts((select d + 36 from hoy)), 1,
  'Si el job no corrió y pasaron dos umbrales (15 y 5), sale un solo aviso');
select is((select (payload ->> 'days_left')::int from public.outbox where kind = 'deadline_alert'
           and org_id = (select v from ids where k = 'org_a') order by id desc limit 1), 4, 'Con los días que faltan de verdad');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', true);
insert into ids values ('v2', public.create_deadline((select v from ids where k = 'org_a'), null, 'Vence el seguro',
  (select d + 10 from hoy), '{5,30,15,15}'));
select is((select notify_days from public.deadlines where id = (select v from ids where k = 'v2')), array[30, 15, 5],
  'Los umbrales se ordenan y no se repiten');
select is((select count(*)::int from public.deadline_alerts where deadline_id = (select v from ids where k = 'v2')), 2,
  'Al crearlo a 10 días, los avisos de 30 y 15 ya no salen');
select public.set_deadline_done((select v from ids where k = 'v2'), true);
reset role;
select is(public.process_deadline_alerts((select d + 6 from hoy)), 0, 'Un vencimiento hecho no avisa');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333"}', true);
select is((select count(*)::int from public.deadlines), 0, 'Otro estudio no ve los vencimientos');

select * from finish();
rollback;
