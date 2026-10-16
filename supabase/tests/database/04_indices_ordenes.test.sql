-- Sprint 2 · Índices, ajuste de etapas y órdenes de cambio.
begin;
create extension if not exists pgtap with schema extensions;
select plan(37);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'ana@estudio-a.com'),     -- dueña A
  ('22222222-2222-2222-2222-222222222222', 'beto@estudio-a.com'),    -- miembro A
  ('33333333-3333-3333-3333-333333333333', 'bruno@estudio-b.com'),   -- dueño B
  ('44444444-4444-4444-4444-444444444444', 'cliente@gmail.com');     -- cliente de A

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
with x as (
  insert into public.projects (org_id, name, created_by)
  select v, 'Casa Norte', '11111111-1111-1111-1111-111111111111' from ids where k = 'org_a'
  returning id)
insert into ids select 'p2', id from x;
select public.invite_member((select v from ids where k = 'org_a'), 'beto@estudio-a.com', 'member');
select public.invite_guest((select v from ids where k = 'p1'), 'cliente@gmail.com', 'client');
select public.apply_fee_template((select v from ids where k = 'p1'), 'ARS');
select public.apply_fee_template((select v from ids where k = 'p2'), 'USD');
insert into ids select 's' || position, id from public.fee_stages where project_id = (select v from ids where k = 'p1');
insert into ids select 'n' || position, id from public.fee_stages where project_id = (select v from ids where k = 'p2');

-- ---------- Índices ----------
select lives_ok($$
  insert into public.price_indices (org_id, name, period, value, created_by)
  select v, 'ICC Córdoba', p::date, val, '11111111-1111-1111-1111-111111111111'
  from ids, (values ('2026-01-01', 100), ('2026-04-01', 106.5), ('2026-07-01', 112.34)) as t (p, val)
  where k = 'org_a' $$, 'La dueña carga tres valores del índice');
select throws_ok($$
  insert into public.price_indices (org_id, name, period, value, created_by)
  select v, 'ICC Córdoba', '2026-07-01', 113, '11111111-1111-1111-1111-111111111111' from ids where k = 'org_a' $$,
  '23505', null, 'No se puede cargar dos veces el mismo mes');
select throws_ok($$
  insert into public.price_indices (org_id, name, period, value, created_by)
  select v, 'ICC Córdoba', '2026-08-15', 113, '11111111-1111-1111-1111-111111111111' from ids where k = 'org_a' $$,
  '23514', null, 'El período es siempre el primer día del mes');
select throws_ok($$
  insert into public.price_indices (org_id, name, period, value, created_by)
  select v, 'Raro', '2026-08-01', 0, '11111111-1111-1111-1111-111111111111' from ids where k = 'org_a' $$,
  '23514', null, 'El valor tiene que ser mayor que cero');

-- ---------- Ajuste de etapas ----------
update public.fee_stages set amount = 5000000, index_name = 'ICC Córdoba', index_base_period = '2026-01-01'
where id = (select v from ids where k = 's1');
update public.fee_stages set amount = 1000, index_name = 'ICC Córdoba', index_base_period = '2026-04-01'
where id = (select v from ids where k = 's2');
update public.fee_stages set amount = 2000, index_name = 'ICC Córdoba', index_base_period = '2025-12-01'
where id = (select v from ids where k = 's3');
update public.fee_stages set amount = 700 where id = (select v from ids where k = 's4');

select throws_ok($$ update public.fee_stages set index_name = 'ICC Córdoba' where id = (select v from ids where k = 's4') $$,
  '23514', null, 'Índice sin mes base se rechaza');
select is((select fee_adjusted from public.fee_stage_summary where id = (select v from ids where k = 's1')), 5617000.00::numeric,
  '5.000.000 × 112,34 ÷ 100 = 5.617.000');
select is((select fee_adjusted from public.fee_stage_summary where id = (select v from ids where k = 's2')), 1054.84::numeric,
  '1.000 × 112,34 ÷ 106,5 = 1.054,84 (redondeado a 2 decimales)');
select is((select index_current_period from public.fee_stage_summary where id = (select v from ids where k = 's2')), '2026-07-01'::date,
  'Se usa el último valor cargado');
select ok((select index_missing from public.fee_stage_summary where id = (select v from ids where k = 's3')),
  'Si falta el valor del mes base, la etapa queda marcada');
select is((select fee_adjusted from public.fee_stage_summary where id = (select v from ids where k = 's3')), 2000.00::numeric,
  'Sin valor base, el monto queda sin ajustar');
select is((select fee_adjusted from public.fee_stage_summary where id = (select v from ids where k = 's4')), 700.00::numeric,
  'Una etapa sin índice no se ajusta');

insert into public.price_indices (org_id, name, period, value, created_by)
select v, 'ICC Córdoba', '2026-08-01', 120, '11111111-1111-1111-1111-111111111111' from ids where k = 'org_a';
select is((select fee_adjusted from public.fee_stage_summary where id = (select v from ids where k = 's1')), 6000000.00::numeric,
  'Un valor nuevo actualiza el monto al instante');
select is((select count(*)::int from public.price_indices where name = 'ICC Córdoba'), 4,
  'El historial de valores queda guardado');

-- ---------- Órdenes de cambio ----------
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222"}', true);
select public.claim_invitations();
select throws_ok($$
  insert into public.price_indices (org_id, name, period, value, created_by)
  select v, 'CAC', '2026-08-01', 10, '22222222-2222-2222-2222-222222222222' from ids where k = 'org_a' $$,
  '42501', null, 'Un miembro no carga índices');

create temp table oc as
select * from public.create_change_order((select v from ids where k = 's2'), 'Carpinterías de PVC',
  'Cambio de aluminio a PVC en fachada norte', 40, 1800, array['A-301', 'A-302']);
select is((select number from oc), 1, 'Beto crea la primera orden: número 1');
select is((select currency from public.change_orders where id = (select id from oc)), 'ARS',
  'La moneda sale de la etapa');
select is((select status from public.change_orders where id = (select id from oc)), 'draft', 'Nace como borrador');
select is((select number from public.create_change_order((select v from ids where k = 's1'), 'Segundo cambio', null, null, 500, '{}')), 2,
  'La segunda orden del mismo proyecto es la número 2');
select is((select number from public.create_change_order((select v from ids where k = 'n1'), 'Otro proyecto', null, null, 100, '{}')), 1,
  'Otro proyecto empieza su propia numeración');
select throws_ok($$ insert into public.change_orders (stage_id, number, title, amount, currency, content_hash, created_by)
  values ((select v from ids where k = 's2'), 99, 'Directo', 1, 'ARS', '', '22222222-2222-2222-2222-222222222222') $$,
  '42501', null, 'No se puede crear una orden salteando la función');

create temp table h1 as select content_hash from public.change_orders where id = (select id from oc);
select lives_ok($$ select public.update_change_order((select id from oc), (select v from ids where k = 's2'),
  'Carpinterías de PVC', 'Cambio de aluminio a PVC en fachada norte', 40, 1950, array['A-301', 'A-302']) $$,
  'Editar el monto de un borrador');
select isnt((select content_hash from public.change_orders where id = (select id from oc)), (select content_hash from h1),
  'Editar cambia la huella del contenido');
select is((select count(*)::int from public.events where type = 'change_order.updated'), 1, 'La edición deja un evento');
select throws_ok($$ select public.update_change_order((select id from oc), (select v from ids where k = 'n1'),
  'x x x', null, null, 1, '{}') $$, '23514', null, 'No se puede mover la orden a una etapa de otro proyecto');
select throws_ok($$ select public.void_change_order((select id from oc), 'Lo pidió el cliente') $$,
  '42501', null, 'Un miembro no puede anular');

select is((select extras_pending from public.fee_stage_summary where id = (select v from ids where k = 's2')), 1950.00::numeric,
  'El borrador figura como adicional pendiente, no aprobado');
select is((select total_amount from public.fee_stage_summary where id = (select v from ids where k = 's2')), 1126.76::numeric,
  'El total todavía no suma el borrador (1.000 × 120 ÷ 106,5 = 1.126,76)');

-- Simula la aprobación del sprint 3 (la hará approve_change_order).
reset role;
update public.change_orders set status = 'approved', decided_at = now() where id = (select id from oc);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', true);
select is((select total_amount from public.fee_stage_summary where id = (select v from ids where k = 's2')), 3076.76::numeric,
  'Aprobada, la orden suma a su etapa: 1.126,76 + 1.950');
select throws_ok($$ update public.fee_stages set currency = 'USD' where id = (select v from ids where k = 's2') $$,
  '22023', null, 'Una etapa con órdenes vigentes no cambia de moneda');
select lives_ok($$ update public.fee_stages set currency = 'USD' where id = (select v from ids where k = 's4') $$,
  'Una etapa sin órdenes sí puede cambiar de moneda');
create temp table h2 as select content_hash from public.change_orders where id = (select id from oc);
select throws_ok($$ select public.update_change_order((select id from oc), (select v from ids where k = 's2'),
  'Cambio', null, null, 1, '{}') $$, '22023', null, 'Una orden aprobada no se puede editar');
select throws_ok($$ select public.void_change_order((select id from oc), '') $$, '22023', null, 'Anular exige un motivo');
select lives_ok($$ select public.void_change_order((select id from oc), 'El cliente desistió') $$, 'La dueña anula la orden');
select is((select content_hash from public.change_orders where id = (select id from oc)), (select content_hash from h2),
  'Anular no cambia la huella del contenido');
select is((select extras_approved from public.fee_stage_summary where id = (select v from ids where k = 's2')), 0.00::numeric,
  'Anulada, deja de sumar');

-- ---------- Aislamiento ----------
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333"}', true);
select is((select count(*)::int from public.change_orders) + (select count(*)::int from public.price_indices), 0,
  'Otro estudio no ve órdenes ni índices');
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444"}', true);
select is((select count(*)::int from public.change_orders) + (select count(*)::int from public.price_indices), 0,
  'El cliente no ve órdenes que no le enviaron');

select * from finish();
rollback;
