-- Sprint 3 · Aprobación por link y panel de lo recuperado.
begin;
create extension if not exists pgtap with schema extensions;
select plan(49);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'ana@estudio-a.com'),     -- dueña A
  ('22222222-2222-2222-2222-222222222222', 'beto@estudio-a.com'),    -- miembro A
  ('33333333-3333-3333-3333-333333333333', 'bruno@estudio-b.com'),   -- dueño B
  ('44444444-4444-4444-4444-444444444444', 'cliente@gmail.com');     -- cliente de A

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
with x as (
  insert into public.projects (org_id, name, created_by)
  select v, 'Casa Norte', '11111111-1111-1111-1111-111111111111' from ids where k = 'org_a'
  returning id)
insert into ids select 'p2', id from x;
select public.invite_member((select v from ids where k = 'org_a'), 'beto@estudio-a.com', 'member');
select public.invite_guest((select v from ids where k = 'p1'), 'cliente@gmail.com', 'client');
select public.apply_fee_template((select v from ids where k = 'p1'), 'USD');
select public.apply_fee_template((select v from ids where k = 'p2'), 'USD');
insert into ids select 's' || position, id from public.fee_stages where project_id = (select v from ids where k = 'p1');
insert into ids select 'n' || position, id from public.fee_stages where project_id = (select v from ids where k = 'p2');

select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333"}', true);
select public.create_organization('Estudio B');

-- Beto crea las órdenes.
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222"}', true);
select public.claim_invitations();
insert into ids select 'oc' || n, id from (values
  (1, (select id from public.create_change_order((select v from ids where k = 's1'), 'Carpinterías de PVC', null, 40, 1800.55, '{A-301}'))),
  (2, (select id from public.create_change_order((select v from ids where k = 's2'), 'Revestimiento del hall', null, 8, 600, '{}'))),
  (3, (select id from public.create_change_order((select v from ids where k = 's1'), 'Baranda de vidrio', null, null, 300, '{}'))),
  (4, (select id from public.create_change_order((select v from ids where k = 's3'), 'Cocheras', null, null, 900, '{}'))),
  (5, (select id from public.create_change_order((select v from ids where k = 's1'), 'Pérgola', null, null, 199.45, '{}'))),
  (6, (select id from public.create_change_order((select v from ids where k = 's2'), 'Para otro', null, null, 50, '{}')))
) as t (n, id);

select throws_ok($$ select public.create_change_order((select v from ids where k = 's1'), 'Demasiados', null, null, 1,
  (select array_agg('A-' || g) from generate_series(1, 31) g)) $$,
  '23514', null, 'La base limita los documentos afectados a 30');
select throws_ok($$ select public.update_change_order((select v from ids where k = 'oc1'), (select v from ids where k = 'n1'),
  'Carpinterías de PVC', null, 40, 1800.55, '{A-301}') $$,
  '23514', null, 'Mover a una etapa de otro proyecto se rechaza con su propio error');

-- ---------- Envío ----------
insert into tok select 't1', token from public.send_change_order((select v from ids where k = 'oc1'), ' Cliente@Gmail.com ');
select is((select status from public.change_orders where id = (select v from ids where k = 'oc1')), 'sent',
  'Enviada, la orden pasa a "enviada"');
select is((select recipient_email from public.approval_links where change_order_id = (select v from ids where k = 'oc1')),
  'cliente@gmail.com', 'El destinatario se guarda en minúsculas');
select is((select count(*)::int from public.approval_links
           where token_hash = encode(extensions.digest((select v from tok where k = 't1'), 'sha256'), 'hex')), 1,
  'La base guarda el hash del token');
select is((select count(*)::int from public.approval_links where token_hash = (select v from tok where k = 't1')), 0,
  'El token en sí no se guarda en el link');
select throws_ok($$ select public.send_change_order((select v from ids where k = 'oc2'), 'no-es-un-correo') $$,
  '23514', null, 'Un correo inválido se rechaza');

select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333"}', true);
select throws_ok($$ select public.send_change_order((select v from ids where k = 'oc2'), 'x@y.com') $$,
  '42501', null, 'Otro estudio no puede enviar la orden');

reset role;
select is((select payload ->> 'token' from public.outbox where kind = 'change_order_sent'
           and to_email = 'cliente@gmail.com' order by id desc limit 1), (select v from tok where k = 't1'),
  'El correo al cliente lleva el token mientras espera salir');
select public.complete_outbox((select id from public.outbox where kind = 'change_order_sent' order by id desc limit 1), true);
select ok(not exists (select 1 from public.outbox where kind = 'change_order_sent' and payload ? 'token' and status = 'sent'),
  'Enviado el correo, el token se borra del outbox');

-- ---------- Página del cliente (sin sesión) ----------
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is((select state from public.get_change_order_for_approval((select v from tok where k = 't1'))), 'valid',
  'Link recién enviado: válido');
select is((select amount from public.get_change_order_for_approval((select v from tok where k = 't1'))), 1800.55::numeric,
  'Muestra el monto de la orden');
select is((select project_name from public.get_change_order_for_approval((select v from tok where k = 't1'))), 'Edificio Alba',
  'Muestra el proyecto');
select is((select state from public.get_change_order_for_approval('cualquier-cosa')), 'invalid', 'Token inexistente: inválido');
select is((select title from public.get_change_order_for_approval('cualquier-cosa')), null, 'Con un token inexistente no se ve nada');
select throws_ok($$ select count(*) from public.approval_links $$, '42501', null, 'Sin sesión no se leen los links');
select throws_ok($$ select count(*) from public.change_orders $$, '42501', null, 'Sin sesión no se leen las órdenes');
select throws_ok($$ select public.send_change_order((select v from ids where k = 'oc2'), 'x@y.com') $$,
  '42501', null, 'Sin sesión no se envían órdenes');
select throws_ok($$ select public.decide_change_order((select v from tok where k = 't1'), 'maybe', 'Juan Pérez') $$,
  '23514', null, 'Decisión inválida');
select throws_ok($$ select public.decide_change_order((select v from tok where k = 't1'), 'approved', ' ') $$,
  '23514', null, 'Hace falta el nombre de quien aprueba');

select is(public.decide_change_order((select v from tok where k = 't1'), 'approved', ' Juan Pérez ', null, '190.0.0.1', 'Safari'),
  'approved', 'El cliente aprueba sin cuenta');
select throws_ok($$ select public.decide_change_order((select v from tok where k = 't1'), 'rejected', 'Juan Pérez') $$,
  '22023', null, 'Un link usado no sirve de nuevo');
select is((select state from public.get_change_order_for_approval((select v from tok where k = 't1'))), 'used', 'El link queda usado');
select is((select signer_name from public.get_change_order_for_approval((select v from tok where k = 't1'))), 'Juan Pérez',
  'La página muestra quién aprobó');

reset role;
select is((select status from public.change_orders where id = (select v from ids where k = 'oc1')), 'approved', 'La orden queda aprobada');
select is((select a.content_hash from public.approvals a where a.change_order_id = (select v from ids where k = 'oc1')),
  (select content_hash from public.change_orders where id = (select v from ids where k = 'oc1')),
  'La aprobación guarda la huella del contenido aprobado');
select is((select signer_email from public.approvals where change_order_id = (select v from ids where k = 'oc1')),
  'cliente@gmail.com', 'Y el correo al que se envió el link');
select is((select actor_email from public.events where type = 'change_order.approved'), 'cliente@gmail.com',
  'El evento queda a nombre del cliente');
select is((select array_agg(to_email order by to_email) from public.outbox where kind = 'change_order_decided'),
  array['ana@estudio-a.com', 'beto@estudio-a.com'], 'Se avisa a la dueña y a quien creó y envió la orden');

-- ---------- Editar después del envío ----------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222"}', true);
insert into tok select 't2', token from public.send_change_order((select v from ids where k = 'oc2'), 'cliente@gmail.com');
select lives_ok($$ select public.update_change_order((select v from ids where k = 'oc2'), (select v from ids where k = 's2'),
  'Revestimiento del hall', null, 8, 600, '{}') $$, 'Guardar sin cambios no toca el envío');
select is((select status from public.change_orders where id = (select v from ids where k = 'oc2')), 'sent', 'Sigue enviada');
select lives_ok($$ select public.update_change_order((select v from ids where k = 'oc2'), (select v from ids where k = 's2'),
  'Revestimiento del hall', null, 8, 650, '{}') $$, 'Cambiar el monto de una orden enviada');
select is((select status from public.change_orders where id = (select v from ids where k = 'oc2')), 'draft',
  'Editada después del envío, vuelve a borrador');
select is((select state from public.get_change_order_for_approval((select v from tok where k = 't2'))), 'changed',
  'El link viejo avisa que la orden cambió');
select throws_ok($$ select public.decide_change_order((select v from tok where k = 't2'), 'approved', 'Juan Pérez') $$,
  '22023', null, 'Y no sirve para aprobar');

-- ---------- Reenvío y rechazo ----------
insert into tok select 't3', token from public.send_change_order((select v from ids where k = 'oc2'), 'cliente@gmail.com');
insert into tok select 't4', token from public.send_change_order((select v from ids where k = 'oc2'), 'cliente@gmail.com');
select is((select state from public.get_change_order_for_approval((select v from tok where k = 't3'))), 'revoked',
  'Reenviar anula el link anterior');
select is(public.decide_change_order((select v from tok where k = 't4'), 'rejected', 'Juan Pérez', 'Muy caro'), 'rejected',
  'El cliente rechaza con el link nuevo');
select is((select comment from public.approvals where approval_link_id =
           (select id from public.approval_links where token_hash = encode(extensions.digest((select v from tok where k = 't4'), 'sha256'), 'hex'))),
  'Muy caro', 'El motivo del rechazo queda guardado');

-- ---------- Vencido y anulado ----------
insert into tok select 't5', token from public.send_change_order((select v from ids where k = 'oc3'), 'cliente@gmail.com', 1);
insert into tok select 't6', token from public.send_change_order((select v from ids where k = 'oc4'), 'cliente@gmail.com');
insert into tok select 't7', token from public.send_change_order((select v from ids where k = 'oc5'), 'cliente@gmail.com');
insert into tok select 't8', token from public.send_change_order((select v from ids where k = 'oc6'), 'otro@gmail.com');
reset role;
update public.approval_links set expires_at = now() - interval '1 minute'
where token_hash = encode(extensions.digest((select v from tok where k = 't5'), 'sha256'), 'hex');
select is((select state from public.get_change_order_for_approval((select v from tok where k = 't5'))), 'expired', 'Link vencido');
select throws_ok($$ select public.decide_change_order((select v from tok where k = 't5'), 'approved', 'Juan Pérez') $$,
  '22023', null, 'Un link vencido no sirve');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', true);
select public.void_change_order((select v from ids where k = 'oc4'), 'El cliente desistió');
select is((select state from public.get_change_order_for_approval((select v from tok where k = 't6'))), 'void',
  'Anular la orden anula su link');
select public.decide_change_order((select v from tok where k = 't7'), 'approved', 'Juan Pérez');

-- ---------- Panel de lo recuperado ----------
select is((select approved_amount from public.change_order_recovery where project_id = (select v from ids where k = 'p1')),
  2000.00::numeric, 'Aprobado: 1.800,55 + 199,45 = 2.000,00');
select is((select approved_amount from public.change_order_recovery where project_id = (select v from ids where k = 'p1')),
  (select sum(amount) from public.change_orders where status in ('approved', 'billable')
   and project_id = (select v from ids where k = 'p1')),
  'Coincide al centavo con la suma de las órdenes aprobadas');
select is((select pending_amount from public.change_order_recovery where project_id = (select v from ids where k = 'p1')),
  350.00::numeric, 'Esperando aprobación: 300 (vencida pero enviada) + 50');
select is((select rejected_count from public.change_order_recovery where project_id = (select v from ids where k = 'p1')), 1,
  'Cuenta las rechazadas aparte');
select is((select approved_amount from public.change_order_recovery_monthly
           where month = date_trunc('month', now() at time zone 'America/Argentina/Cordoba')::date), 2000.00::numeric,
  'Por mes: lo aprobado este mes');

-- ---------- Quién ve qué ----------
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444"}', true);
select is((select count(*)::int from public.change_orders), 5,
  'El cliente ve las órdenes que le enviaron, no la que fue a otro correo');
select is((select count(*)::int from public.approval_links) + (select count(*)::int from public.approvals), 0,
  'El cliente no ve los links ni las aprobaciones internas');

select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333"}', true);
select is((select count(*)::int from public.approval_links) + (select count(*)::int from public.approvals)
          + (select count(*)::int from public.change_order_recovery), 0,
  'Otro estudio no ve links, aprobaciones ni el panel');

select * from finish();
rollback;
