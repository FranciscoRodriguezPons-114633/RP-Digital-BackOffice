-- Sprint 5 · Puesta en marcha: copiar un proyecto y proyecto de ejemplo.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'ana@estudio-a.com'),
  ('22222222-2222-2222-2222-222222222222', 'beto@estudio-a.com'),
  ('33333333-3333-3333-3333-333333333333', 'bruno@estudio-b.com');

create temp table ids (k text primary key, v uuid);
grant select, insert, update on ids to public;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', true);
insert into ids values ('org_a', public.create_organization('Estudio A'));
select public.invite_member((select v from ids where k = 'org_a'), 'beto@estudio-a.com', 'member');

select lives_ok($$ insert into ids values ('ej', public.create_sample_project((select v from ids where k = 'org_a'))) $$,
  'La dueña crea el proyecto de ejemplo');
select is((select count(*)::int from public.fee_stages where project_id = (select v from ids where k = 'ej')), 4, 'Con sus 4 etapas');
select is((select count(*)::int from public.documents where project_id = (select v from ids where k = 'ej')), 4, 'Sus planos');
select is((select count(*)::int from public.change_orders where project_id = (select v from ids where k = 'ej')), 1, 'Una orden en borrador');
select is((select count(*)::int from public.deadlines where project_id = (select v from ids where k = 'ej')), 1, 'Y un vencimiento');

with x as (
  insert into public.projects (org_id, name, created_by)
  select v, 'Casa Nueva', '11111111-1111-1111-1111-111111111111' from ids where k = 'org_a' returning id)
insert into ids select 'nuevo', id from x;
select is(public.copy_project_setup((select v from ids where k = 'ej'), (select v from ids where k = 'nuevo')), 8,
  'Copiar el ejemplo trae 4 etapas y 4 planos');
select throws_ok($$ select public.copy_project_setup((select v from ids where k = 'ej'), (select v from ids where k = 'nuevo')) $$,
  '22023', null, 'No se copia sobre un proyecto que ya tiene etapas');

select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222"}', true);
select public.claim_invitations();
select throws_ok($$ select public.create_sample_project((select v from ids where k = 'org_a')) $$,
  '42501', null, 'Un miembro no crea el proyecto de ejemplo');

select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333"}', true);
select public.create_organization('Estudio B');
select throws_ok($$ select public.copy_project_setup((select v from ids where k = 'ej'), (select v from ids where k = 'nuevo')) $$,
  '42501', null, 'Otro estudio no copia proyectos ajenos');

select * from finish();
rollback;
