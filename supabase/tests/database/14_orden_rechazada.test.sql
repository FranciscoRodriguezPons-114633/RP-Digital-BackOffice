-- Sprint 3 · Corregir y reenviar una orden rechazada.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'ana@estudio-a.com'),     -- dueña A
  ('22222222-2222-2222-2222-222222222222', 'beto@estudio-a.com'),    -- miembro A
  ('33333333-3333-3333-3333-333333333333', 'bruno@estudio-b.com');   -- dueño B

create temp table ids (k text primary key, v uuid);
create temp table tok (k text primary key, v text);
grant select, insert, update on ids, tok to public;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', true);
insert into ids values ('org_a', public.create_organization('Estudio A'));
with x as (
  insert into public.projects (org_id, name, created_by)
  select v, 'Edificio Alba', '11111111-1111-1111-1111-111111111111' from ids where k = 'org_a'
  returning id)
insert into ids select 'p1', id from x;
select public.invite_member((select v from ids where k = 'org_a'), 'beto@estudio-a.com', 'member');
select public.apply_fee_template((select v from ids where k = 'p1'), 'USD');
insert into ids select 's' || position, id from public.fee_stages where project_id = (select v from ids where k = 'p1');
insert into ids select 'oc1', id from public.create_change_order((select v from ids where k = 's1'),
  'Carpinterías de PVC', null, 40, 1800, '{A-301}');
insert into ids select 'oc2', id from public.create_change_order((select v from ids where k = 's1'),
  'Pérgola', null, null, 300, '{}');
insert into tok select 't1', token from public.send_change_order((select v from ids where k = 'oc1'), 'cliente@gmail.com');
insert into tok select 't2', token from public.send_change_order((select v from ids where k = 'oc2'), 'cliente@gmail.com');

select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333"}', true);
select public.create_organization('Estudio B');

-- El cliente rechaza las dos.
reset role;
set local role anon;
select public.decide_change_order((select v from tok where k = 't1'), 'rejected', 'Juan Pérez', 'Muy caro');
select public.decide_change_order((select v from tok where k = 't2'), 'rejected', 'Juan Pérez');
reset role;

select is((select status from public.change_orders where id = (select v from ids where k = 'oc1')), 'rejected',
  'La orden quedó rechazada');

-- Otro estudio no puede tocarla.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333"}', true);
select throws_ok($$ select public.update_change_order((select v from ids where k = 'oc1'), (select v from ids where k = 's1'),
  'Carpinterías de PVC', null, 40, 1500, '{A-301}') $$, '42501', null, 'Otro estudio no edita la orden rechazada');

-- Beto (miembro) la corrige: baja el monto.
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222"}', true);
select public.claim_invitations();
select lives_ok($$ select public.update_change_order((select v from ids where k = 'oc1'), (select v from ids where k = 's1'),
  'Carpinterías de PVC', null, 40, 1500, '{A-301}') $$, 'Un miembro corrige una orden rechazada');
reset role;
select is((select status from public.change_orders where id = (select v from ids where k = 'oc1')), 'draft',
  'Corregida vuelve a borrador');
select is((select decided_at from public.change_orders where id = (select v from ids where k = 'oc1')), null,
  'Se limpia la fecha de decisión: la orden vuelve a estar abierta');
select is((select amount from public.change_orders where id = (select v from ids where k = 'oc1')), 1500.00::numeric,
  'Guarda el monto nuevo');
select is((select count(*)::int from public.approvals where change_order_id = (select v from ids where k = 'oc1')
           and decision = 'rejected' and comment = 'Muy caro'), 1,
  'El rechazo anterior queda registrado');
select is((select data ->> 'previous_status' from public.events
           where type = 'change_order.updated' and entity_id = (select v from ids where k = 'oc1')
           order by id desc limit 1), 'rejected',
  'La actividad registra que se corrigió una rechazada');
select is((select state from public.get_change_order_for_approval((select v from tok where k = 't1'))), 'used',
  'El link viejo sigue mostrando la respuesta que dio el cliente');

-- Se reenvía y el cliente la aprueba.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222"}', true);
insert into tok select 't3', token from public.send_change_order((select v from ids where k = 'oc1'), 'cliente@gmail.com');
reset role;
set local role anon;
select is(public.decide_change_order((select v from tok where k = 't3'), 'approved', 'Juan Pérez'), 'approved',
  'Reenviada, el cliente la aprueba con el link nuevo');
reset role;
select is((select approved_amount from public.change_order_recovery where project_id = (select v from ids where k = 'p1')),
  1500.00::numeric, 'Lo recuperado cuenta el monto corregido, no el rechazado');

-- Sin cambiar nada también vuelve a borrador (el estudio lo habló con el cliente y la reenvía igual).
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222"}', true);
select public.update_change_order((select v from ids where k = 'oc2'), (select v from ids where k = 's1'),
  'Pérgola', null, null, 300, '{}');
reset role;
select is((select status from public.change_orders where id = (select v from ids where k = 'oc2')), 'draft',
  'Sin cambios, una rechazada igual vuelve a borrador para reenviarla');

-- Una aprobada sigue sin poder editarse.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222"}', true);
select throws_ok($$ select public.update_change_order((select v from ids where k = 'oc1'), (select v from ids where k = 's1'),
  'Carpinterías de PVC', null, 40, 9999, '{A-301}') $$, '22023', null, 'Una aprobada no se edita');

select * from finish();
rollback;
