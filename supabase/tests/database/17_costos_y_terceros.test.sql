-- Finanzas de obra · Sprint 3 · Costo interno, rentabilidad y terceros.
begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'ana@estudio-a.com'),     -- dueña A
  ('22222222-2222-2222-2222-222222222222', 'beto@estudio-a.com'),    -- miembro A
  ('33333333-3333-3333-3333-333333333333', 'bruno@estudio-b.com');   -- dueño B

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
update public.fee_stages set amount = 1000
where id = (select id from public.fee_stages where project_id = (select v from ids where k = 'p1') order by position limit 1);
insert into ids select 's1', id from public.fee_stages where project_id = (select v from ids where k = 'p1') and amount = 1000;
select public.invite_member((select v from ids where k = 'org_a'), 'beto@estudio-a.com', 'member');
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333"}', true);
insert into ids values ('org_b', public.create_organization('Estudio B'));
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222"}', true);
select public.claim_invitations();
reset role;

update public.organizations set beta_features = '{works}' where id = (select v from ids where k = 'org_a');

-- Horas: Ana 4 h el 1/10 y 2 h el 20/10; Beto 3 h el 5/10 y 1 h el 1/9 (antes de tener costo).
insert into public.time_entries (stage_id, user_id, work_date, hours)
select (select v from ids where k = 's1'), u::uuid, d::date, h
from (values ('11111111-1111-1111-1111-111111111111', '2026-10-01', 4),
             ('11111111-1111-1111-1111-111111111111', '2026-10-20', 2),
             ('22222222-2222-2222-2222-222222222222', '2026-10-05', 3),
             ('22222222-2222-2222-2222-222222222222', '2026-09-01', 1)) as t (u, d, h);

-- Costo por hora: solo el dueño ----------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222"}', true);
select throws_ok($$ insert into public.member_costs (org_id, user_id, hourly_cost, currency, valid_from, created_by)
  values ((select v from ids where k = 'org_a'), '22222222-2222-2222-2222-222222222222', 1, 'USD', '2026-01-01',
          '22222222-2222-2222-2222-222222222222') $$,
  '42501', null, 'Un miembro no carga costos');

select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', true);
insert into public.member_costs (org_id, user_id, hourly_cost, currency, valid_from, created_by) values
  ((select v from ids where k = 'org_a'), '11111111-1111-1111-1111-111111111111', 20, 'USD', '2026-01-01', '11111111-1111-1111-1111-111111111111'),
  ((select v from ids where k = 'org_a'), '11111111-1111-1111-1111-111111111111', 25, 'USD', '2026-10-15', '11111111-1111-1111-1111-111111111111'),
  ((select v from ids where k = 'org_a'), '22222222-2222-2222-2222-222222222222', 15000, 'ARS', '2026-10-01', '11111111-1111-1111-1111-111111111111');
select is((select count(*)::int from public.member_costs), 3, 'La dueña carga y lee los costos');
select throws_ok($$ insert into public.member_costs (org_id, user_id, hourly_cost, currency, valid_from, created_by)
  values ((select v from ids where k = 'org_a'), '33333333-3333-3333-3333-333333333333', 10, 'USD', '2026-01-01',
          '11111111-1111-1111-1111-111111111111') $$,
  '23514', null, 'No se carga costo de alguien que no es del estudio');
select throws_ok($$ insert into public.member_costs (org_id, user_id, hourly_cost, currency, valid_from, created_by)
  values ((select v from ids where k = 'org_a'), '11111111-1111-1111-1111-111111111111', 30, 'USD', '2026-10-15',
          '11111111-1111-1111-1111-111111111111') $$,
  '23505', null, 'Un costo por persona y fecha de vigencia');
select throws_ok($$ insert into public.member_costs (org_id, user_id, hourly_cost, currency, valid_from, created_by)
  values ((select v from ids where k = 'org_a'), '11111111-1111-1111-1111-111111111111', 0, 'USD', '2026-11-01',
          '11111111-1111-1111-1111-111111111111') $$,
  '23514', null, 'El costo tiene que ser mayor que cero');

-- Rentabilidad: USD 1000 de honorario − (4 × 20 + 2 × 25) = 870; en pesos, − 3 × 15000.
select results_eq(
  $$ select currency, income, cost, profit from public.stage_profitability
     where stage_id = (select v from ids where k = 's1') order by currency $$,
  $$ values ('ARS'::text, 0.00::numeric, 45000.00::numeric, -45000.00::numeric),
            ('USD'::text, 1000.00::numeric, 130.00::numeric, 870.00::numeric) $$,
  'Rentabilidad por moneda, con el costo vigente a la fecha de cada hora');
select is((select hours_missing_cost from public.stage_profitability
           where stage_id = (select v from ids where k = 's1') and currency = 'USD'), 1.00::numeric,
  'La hora sin costo vigente se informa aparte, no se toma como cero');
select results_eq(
  $$ select user_id, hours, first_date from public.missing_member_costs $$,
  $$ values ('22222222-2222-2222-2222-222222222222'::uuid, 1.00::numeric, '2026-09-01'::date) $$,
  'Se sabe a quién le falta el costo y desde cuándo');

select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222"}', true);
select is((select count(*)::int from public.member_costs), 0, 'Un miembro no ve la tabla de costos');
select is((select count(*)::int from public.stage_profitability), 0, 'A un miembro la rentabilidad le devuelve vacío');
select is((select count(*)::int from public.missing_member_costs), 0, 'Ni la lista de costos faltantes');
select is((select count(*)::int from public.events where type = 'member_cost.created'), 3,
  'Cada alta de costo deja un evento');
select is((select count(*)::int from public.events where type = 'member_cost.created' and data ? 'hourly_cost'), 0,
  'El evento no lleva el monto (los miembros leen el registro)');

-- Terceros -----------------------------------------------------------------------
select is(private.is_valid_cuit('20123456786'), true, 'CUIT válido');
select is(private.is_valid_cuit('20123456787'), false, 'CUIT con dígito verificador incorrecto');

select throws_ok($$ insert into public.parties (org_id, name, tax_id, roles, created_by)
  values ((select v from ids where k = 'org_a'), 'Hormigonera Sur', '20-12345678-7', '{supplier}',
          '22222222-2222-2222-2222-222222222222') $$,
  '23514', null, 'Un CUIT inválido se rechaza');
insert into public.parties (org_id, name, tax_id, roles, vat_condition, gross_income_condition, created_by)
values ((select v from ids where k = 'org_a'), 'Hormigonera Sur', '30-71234567-1', '{supplier,subcontractor}',
        'registered', 'multilateral', '22222222-2222-2222-2222-222222222222');
select is((select tax_id from public.parties where name = 'Hormigonera Sur'), '30712345671',
  'Un miembro registra un tercero y el CUIT se guarda solo con dígitos');
select throws_ok($$ insert into public.parties (org_id, name, tax_id, roles, created_by)
  values ((select v from ids where k = 'org_a'), 'Otra razón social', '30712345671', '{client}',
          '22222222-2222-2222-2222-222222222222') $$,
  '23505', null, 'El CUIT es único por organización');
select throws_ok($$ insert into public.parties (org_id, name, roles, created_by)
  values ((select v from ids where k = 'org_a'), 'Sin rol', '{}', '22222222-2222-2222-2222-222222222222') $$,
  '23514', null, 'Un tercero necesita al menos un rol');
select throws_ok($$ insert into public.parties (org_id, name, roles, created_by)
  values ((select v from ids where k = 'org_a'), 'Rol raro', '{socio}', '22222222-2222-2222-2222-222222222222') $$,
  '23514', null, 'Solo comitente, proveedor o subcontratista');
insert into public.parties (org_id, name, tax_id, roles, created_by)
values ((select v from ids where k = 'org_a'), 'Desarrollos del Centro', '30500000003', '{client}',
        '22222222-2222-2222-2222-222222222222');

select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333"}', true);
select throws_ok($$ insert into public.parties (org_id, name, tax_id, roles, created_by)
  values ((select v from ids where k = 'org_b'), 'Hormigonera Sur', '30712345671', '{supplier}',
          '33333333-3333-3333-3333-333333333333') $$,
  '42501', null, 'Sin las funciones de obra no se cargan terceros');
reset role;
update public.organizations set beta_features = '{works}' where id = (select v from ids where k = 'org_b');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333"}', true);
select lives_ok($$ insert into public.parties (org_id, name, tax_id, roles, created_by)
  values ((select v from ids where k = 'org_b'), 'Hormigonera Sur', '30712345671', '{supplier}',
          '33333333-3333-3333-3333-333333333333') $$,
  'Otra organización puede tener el mismo CUIT');
select is((select count(*)::int from public.parties), 1, 'Cada organización ve solo sus terceros');
insert into ids select 'party_b', id from public.parties;

-- Comitente en la ficha de obra ---------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222"}', true);
select throws_ok($$ select public.upsert_work((select v from ids where k = 'p1'), 'works_director', null, null,
  2400, 0, 'multifamily', 'standard', null, null, 'USD', (select id from public.parties where name = 'Hormigonera Sur')) $$,
  '23514', null, 'Un proveedor no puede ser el comitente');
select throws_ok($$ select public.upsert_work((select v from ids where k = 'p1'), 'works_director', null, null,
  2400, 0, 'multifamily', 'standard', null, null, 'USD', (select v from ids where k = 'party_b')) $$,
  '23514', null, 'El comitente no puede ser de otra organización');
select lives_ok($$ select public.upsert_work((select v from ids where k = 'p1'), 'works_director', null, null,
  2400, 0, 'multifamily', 'standard', null, null, 'USD', (select id from public.parties where name = 'Desarrollos del Centro')) $$,
  'La ficha vincula al comitente');
select is((select p.name from public.works w join public.parties p on p.id = w.client_party_id
           where w.project_id = (select v from ids where k = 'p1')), 'Desarrollos del Centro',
  'works.client_party_id queda guardado');

delete from public.parties where name = 'Hormigonera Sur';
select is((select count(*)::int from public.parties where name = 'Hormigonera Sur'), 1, 'Un miembro no borra terceros');
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', true);
select throws_ok($$ delete from public.parties where name = 'Desarrollos del Centro' $$,
  '23503', null, 'No se borra un comitente que está en una ficha de obra');
reset role;

select * from finish();
rollback;
