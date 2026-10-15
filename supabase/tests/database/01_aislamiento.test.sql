-- E0 · Aislamiento entre organizaciones, invitados y outbox.
-- Se corre con `supabase test db` (o scripts/db/test-local.sh sin Docker).
begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

-- Usuarios de prueba
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'ana@estudio-a.com'),     -- dueña del estudio A
  ('22222222-2222-2222-2222-222222222222', 'beto@estudio-a.com'),    -- miembro invitado del estudio A
  ('33333333-3333-3333-3333-333333333333', 'bruno@estudio-b.com'),   -- dueño del estudio B
  ('55555555-5555-5555-5555-555555555555', 'extra@otro.com');        -- usuario sin relación

create temp table ids (k text primary key, v uuid);
grant select, insert on ids to public;

-- ---------- Ana crea el estudio A y dos proyectos ----------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', true);
insert into ids values ('org_a', public.create_organization('Estudio A'));
with x as (
  insert into public.projects (org_id, name, created_by)
  select v, 'Edificio Alba', '11111111-1111-1111-1111-111111111111' from ids where k = 'org_a'
  returning id)
insert into ids select 'p1', id from x;
with x as (
  insert into public.projects (org_id, name, created_by)
  select v, 'Casa Norte', '11111111-1111-1111-1111-111111111111' from ids where k = 'org_a'
  returning id)
insert into ids select 'p2', id from x;

select is((select count(*)::int from public.projects), 2, 'Ana ve sus 2 proyectos');
select is((select role from public.memberships where user_id = '11111111-1111-1111-1111-111111111111'),
          'owner', 'Ana queda como dueña del estudio');
select ok((select count(*) from public.events where type = 'project.created') = 2,
          'Cada proyecto creado deja un evento');

-- ---------- Bruno crea el estudio B ----------
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333"}', true);
insert into ids values ('org_b', public.create_organization('Estudio B'));

select is((select count(*)::int from public.projects), 0, 'Bruno no ve proyectos del estudio A');
select is((select count(*)::int from public.organizations), 1, 'Bruno solo ve su propio estudio');
select is((select count(*)::int from public.events where org_id = (select v from ids where k = 'org_a')), 0,
          'Bruno no ve eventos del estudio A');
select is((select count(*)::int from public.memberships where org_id = (select v from ids where k = 'org_a')), 0,
          'Bruno no ve miembros del estudio A');
select throws_ok(
  $$ insert into public.projects (org_id, name, created_by)
     select v, 'Intruso', '33333333-3333-3333-3333-333333333333' from ids where k = 'org_a' $$,
  '42501', null, 'Bruno no puede crear proyectos en el estudio A');
select is_empty(
  $$ update public.projects set name = 'Hackeado' where org_id = (select v from ids where k = 'org_a') returning id $$,
  'Bruno no puede modificar proyectos del estudio A');
select throws_ok(
  $$ select public.invite_guest((select v from ids where k = 'p1'), 'x@x.com', 'client') $$,
  '42501', null, 'Bruno no puede invitar gente a proyectos del estudio A');

-- ---------- Ana invita a un cliente al proyecto 1 y a Beto como miembro ----------
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', true);
select lives_ok(
  $$ select public.invite_guest((select v from ids where k = 'p1'), ' Cliente@Gmail.com ', 'client') $$,
  'Ana invita a un cliente (el correo se normaliza)');
select lives_ok(
  $$ select public.invite_member((select v from ids where k = 'org_a'), 'beto@estudio-a.com', 'member') $$,
  'Ana invita a Beto como miembro');
select throws_ok(
  $$ select public.invite_guest((select v from ids where k = 'p1'), 'otro@gmail.com', 'jefe') $$,
  '22023', null, 'Un tipo de invitado inválido se rechaza');
select throws_ok($$ select * from public.outbox $$, '42501', null, 'Un usuario autenticado no puede leer el outbox');
select throws_ok($$ select * from public.claim_outbox(10) $$, '42501', null,
                 'Un usuario autenticado no puede procesar el outbox');
select throws_ok($$ update public.events set type = 'x' $$, '42501', null, 'Los eventos no se pueden modificar');
select throws_ok($$ delete from public.events $$, '42501', null, 'Los eventos no se pueden borrar');

-- ---------- El cliente se registra después de ser invitado e inicia sesión ----------
reset role;
insert into auth.users (id, email) values ('44444444-4444-4444-4444-444444444444', 'cliente@gmail.com');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444"}', true);
select is(public.claim_invitations(), 1, 'Al iniciar sesión, el cliente toma su invitación');
select is((select count(*)::int from public.projects), 1, 'El cliente ve solo el proyecto al que fue invitado');
select is((select name from public.organizations), 'Estudio A', 'El cliente ve el nombre del estudio');
select is((select count(*)::int from public.events), 0, 'El cliente no ve la auditoría interna');
select is((select count(*)::int from public.memberships), 0, 'El cliente no ve los miembros del estudio');
select throws_ok(
  $$ insert into public.projects (org_id, name, created_by)
     select v, 'Proyecto del cliente', '44444444-4444-4444-4444-444444444444' from ids where k = 'org_a' $$,
  '42501', null, 'El cliente no puede crear proyectos');

-- ---------- Beto acepta y queda como miembro, sin poder invitar miembros ----------
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222"}', true);
select is(public.claim_invitations(), 1, 'Beto toma su invitación de miembro');
select is((select count(*)::int from public.projects), 2, 'Beto ve los 2 proyectos del estudio');
select throws_ok(
  $$ select public.invite_member((select v from ids where k = 'org_a'), 'z@z.com', 'member') $$,
  '42501', null, 'Un miembro que no es dueño no puede invitar miembros');

-- ---------- Anónimo ----------
reset role;
set local role anon;
select throws_ok($$ select * from public.projects $$, '42501', null, 'Un anónimo no lee proyectos');

-- ---------- Proceso de outbox con service_role ----------
reset role;
set local role service_role;
select is((select count(*)::int from public.claim_outbox(10)), 2,
          'service_role toma los 2 correos pendientes (cliente y Beto)');

select * from finish();
rollback;
