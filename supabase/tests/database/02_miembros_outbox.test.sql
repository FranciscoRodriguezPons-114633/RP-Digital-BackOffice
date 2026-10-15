-- E0 · Listado de miembros y reintentos del outbox.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'ana@estudio-a.com'),
  ('33333333-3333-3333-3333-333333333333', 'bruno@estudio-b.com'),
  ('44444444-4444-4444-4444-444444444444', 'cliente@gmail.com');

create temp table ids (k text primary key, v uuid);
grant select, insert on ids to public;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', true);
insert into ids values ('org_a', public.create_organization('Estudio A'));
with x as (
  insert into public.projects (org_id, name, created_by)
  select v, 'Edificio Alba', '11111111-1111-1111-1111-111111111111' from ids where k = 'org_a'
  returning id)
insert into ids select 'p1', id from x;
select public.invite_guest((select v from ids where k = 'p1'), 'cliente@gmail.com', 'client');

select is((select count(*)::int from public.list_org_members((select v from ids where k = 'org_a'))), 1,
          'Ana ve un miembro en su estudio');
select is((select email from public.list_org_members((select v from ids where k = 'org_a'))),
          'ana@estudio-a.com', 'El listado incluye el correo');

select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333"}', true);
select throws_ok($$ select * from public.list_org_members((select v from ids where k = 'org_a')) $$,
                 '42501', null, 'Otro estudio no puede listar miembros ajenos');

select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444"}', true);
select throws_ok($$ select * from public.list_org_members((select v from ids where k = 'org_a')) $$,
                 '42501', null, 'Un invitado no puede listar a los miembros del estudio');

-- ---------- Outbox ----------
reset role;
set local role service_role;
create temp table claimed as select * from public.claim_outbox(10);
select is((select count(*)::int from claimed), 1, 'Se toma el correo pendiente');
select is((select count(*)::int from public.claim_outbox(10)), 0,
          'Un correo en proceso no se vuelve a tomar enseguida');

-- Simula que el proceso se cayó hace 11 minutos.
update public.outbox set next_try_at = now() - interval '1 minute' where id = (select id from claimed);
select is((select count(*)::int from public.claim_outbox(10)), 1,
          'Un correo trabado vuelve a estar disponible al vencer el plazo');

select public.complete_outbox((select id from claimed), false, 'timeout');
select is((select status from public.outbox where id = (select id from claimed)), 'pending',
          'Un envío fallido vuelve a la cola');

select public.complete_outbox((select id from claimed), true, null);
select is((select status from public.outbox where id = (select id from claimed)), 'sent',
          'Un envío exitoso queda como enviado');

select * from finish();
rollback;
