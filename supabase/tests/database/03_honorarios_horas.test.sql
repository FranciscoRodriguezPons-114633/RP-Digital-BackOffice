-- Sprint 1 · Honorarios por etapa, horas y avisos.
begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'ana@estudio-a.com'),     -- dueña A
  ('22222222-2222-2222-2222-222222222222', 'beto@estudio-a.com'),    -- miembro A
  ('33333333-3333-3333-3333-333333333333', 'bruno@estudio-b.com'),   -- dueño B
  ('44444444-4444-4444-4444-444444444444', 'cliente@gmail.com');     -- cliente de A

create temp table ids (k text primary key, v uuid);
grant select, insert, update on ids to public;

-- ---------- Ana arma el estudio, un proyecto y la plantilla ----------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', true);
insert into ids values ('org_a', public.create_organization('Estudio A'));
with x as (
  insert into public.projects (org_id, name, created_by)
  select v, 'Edificio Alba', '11111111-1111-1111-1111-111111111111' from ids where k = 'org_a'
  returning id)
insert into ids select 'p1', id from x;
select public.invite_member((select v from ids where k = 'org_a'), 'beto@estudio-a.com', 'member');
select public.invite_guest((select v from ids where k = 'p1'), 'cliente@gmail.com', 'client');

select is(public.apply_fee_template((select v from ids where k = 'p1'), 'USD'), 4,
          'La plantilla crea 4 etapas');
select is(public.apply_fee_template((select v from ids where k = 'p1'), 'USD'), 0,
          'La plantilla no duplica etapas si el proyecto ya tiene');
select results_eq(
  $$ select name from public.fee_stages where project_id = (select v from ids where k = 'p1') order by position $$,
  $$ values ('Croquis preliminar'), ('Anteproyecto'), ('Documentación de proyecto'), ('Dirección de obra') $$,
  'Las etapas de la plantilla quedan en orden');
select throws_ok($$ select public.apply_fee_template((select v from ids where k = 'p1'), 'EUR') $$,
                 '22023', null, 'Una moneda inválida se rechaza');

-- Configura tres tipos de etapa
update public.fee_stages set amount = 7200, budget_hours = 10
where project_id = (select v from ids where k = 'p1') and position = 1;
update public.fee_stages set kind = 'hourly', amount = null, hourly_rate = 45, budget_hours = 100
where project_id = (select v from ids where k = 'p1') and position = 2;
update public.fee_stages set kind = 'mixed', amount = 16800, hourly_rate = 40, budget_hours = 20
where project_id = (select v from ids where k = 'p1') and position = 3;
update public.fee_stages set currency = 'ARS', amount = 5000000
where project_id = (select v from ids where k = 'p1') and position = 4;
insert into ids select 's' || position, id from public.fee_stages where project_id = (select v from ids where k = 'p1');

select throws_ok(
  $$ update public.fee_stages set kind = 'hourly', hourly_rate = null where id = (select v from ids where k = 's1') $$,
  '23514', null, 'Una etapa por hora sin tarifa se rechaza');
select throws_ok(
  $$ update public.fee_stages set alert_80_at = now() where id = (select v from ids where k = 's1') $$,
  '42501', null, 'La app no puede marcar los avisos a mano');

-- ---------- Beto entra como miembro y carga horas ----------
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222"}', true);
select public.claim_invitations();

select is((select count(*)::int from public.fee_stages), 4, 'Beto (miembro) ve las etapas');
select throws_ok(
  $$ insert into public.fee_stages (org_id, project_id, name, amount, created_by)
     select v, (select v from ids where k = 'p1'), 'Extra', 1, '22222222-2222-2222-2222-222222222222' from ids where k = 'org_a' $$,
  '42501', null, 'Un miembro no puede crear etapas');
select is_empty(
  $$ update public.fee_stages set amount = 1 where id = (select v from ids where k = 's1') returning id $$,
  'Un miembro no puede cambiar honorarios');

select lives_ok(
  $$ insert into public.time_entries (stage_id, user_id, hours, note)
     values ((select v from ids where k = 's1'), '22222222-2222-2222-2222-222222222222', 7.5, 'Relevamiento') $$,
  'Beto carga 7,5 h en Croquis');
select is((select project_id from public.time_entries limit 1), (select v from ids where k = 'p1'),
          'El proyecto de la hora se toma de la etapa');
select throws_ok(
  $$ insert into public.time_entries (stage_id, user_id, hours)
     values ((select v from ids where k = 's1'), '11111111-1111-1111-1111-111111111111', 1) $$,
  '42501', null, 'Beto no puede cargar horas a nombre de otra persona');
select throws_ok(
  $$ insert into public.time_entries (stage_id, user_id, hours)
     values ((select v from ids where k = 's1'), '22222222-2222-2222-2222-222222222222', 25) $$,
  '23514', null, 'No se aceptan más de 24 h en una carga');
select throws_ok(
  $$ insert into public.time_entries (stage_id, user_id, hours)
     values ((select v from ids where k = 's1'), '22222222-2222-2222-2222-222222222222', 0) $$,
  '23514', null, 'No se aceptan cargas de 0 h');

-- ---------- Avisos ----------
reset role;
select is((select count(*)::int from public.outbox where kind = 'hours_alert'), 0,
          'Con 75% de las horas todavía no hay aviso');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222"}', true);
insert into public.time_entries (stage_id, user_id, hours)
values ((select v from ids where k = 's1'), '22222222-2222-2222-2222-222222222222', 1);
reset role;
select is((select count(*)::int from public.outbox where kind = 'hours_alert' and payload ->> 'threshold' = '80'), 1,
          'Al pasar el 80% sale un aviso al dueño');
select is((select to_email from public.outbox where kind = 'hours_alert' limit 1), 'ana@estudio-a.com',
          'El aviso va a la dueña, no al miembro');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222"}', true);
insert into public.time_entries (stage_id, user_id, hours)
values ((select v from ids where k = 's1'), '22222222-2222-2222-2222-222222222222', 0.5);
reset role;
select is((select count(*)::int from public.outbox where kind = 'hours_alert' and payload ->> 'threshold' = '80'), 1,
          'El aviso del 80% sale una sola vez');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222"}', true);
insert into public.time_entries (stage_id, user_id, hours)
values ((select v from ids where k = 's1'), '22222222-2222-2222-2222-222222222222', 2);
reset role;
select is((select count(*)::int from public.outbox where kind = 'hours_alert' and payload ->> 'threshold' = '100'), 1,
          'Al pasar el 100% sale el segundo aviso');
select is((select count(*)::int from public.events where type in ('stage.hours_80', 'stage.hours_100')), 2,
          'Cada aviso deja su evento');

-- ---------- Cálculo del honorario por tipo ----------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', true);
insert into public.time_entries (stage_id, user_id, hours) values
  ((select v from ids where k = 's2'), '11111111-1111-1111-1111-111111111111', 10),
  ((select v from ids where k = 's3'), '11111111-1111-1111-1111-111111111111', 24),
  ((select v from ids where k = 's3'), '11111111-1111-1111-1111-111111111111', 1.5);

select is((select hours_used from public.fee_stage_summary where id = (select v from ids where k = 's1')), 11.00::numeric,
          'Croquis suma 11 h');
select is((select fee_amount from public.fee_stage_summary where id = (select v from ids where k = 's1')), 7200.00::numeric,
          'Fija: el honorario es el monto');
select is((select fee_amount from public.fee_stage_summary where id = (select v from ids where k = 's2')), 450.00::numeric,
          'Por hora: 10 h × 45 = 450');
select is((select fee_amount from public.fee_stage_summary where id = (select v from ids where k = 's3')), 17020.00::numeric,
          'Mixta: 16.800 + (25,5 − 20) h × 40 = 17.020');
select is((select budget_pct from public.fee_stage_summary where id = (select v from ids where k = 's1')), 110.0::numeric,
          'Croquis va al 110% de lo presupuestado');
select results_eq(
  $$ select currency, sum(fee_amount) from public.fee_stage_summary
     where project_id = (select v from ids where k = 'p1') group by currency order by currency $$,
  $$ values ('ARS'::text, 5000000.00::numeric), ('USD'::text, 24670.00::numeric) $$,
  'El total se suma por moneda');

select is_empty(
  $$ update public.time_entries set hours = 1 where user_id = '22222222-2222-2222-2222-222222222222' returning id $$,
  'Ana no puede modificar las horas de Beto');
select lives_ok(
  $$ delete from public.time_entries where user_id = '22222222-2222-2222-2222-222222222222' and hours = 0.5 $$,
  'La dueña puede borrar una carga equivocada de un miembro');

-- ---------- Aislamiento ----------
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333"}', true);
select is((select count(*)::int from public.fee_stage_summary) + (select count(*)::int from public.time_entries), 0,
          'Otro estudio no ve etapas ni horas');
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444"}', true);
select is((select count(*)::int from public.fee_stages) + (select count(*)::int from public.time_entries), 0,
          'El cliente invitado no ve honorarios ni horas');

select * from finish();
rollback;
