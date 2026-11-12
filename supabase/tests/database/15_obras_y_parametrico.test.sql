-- Finanzas de obra · Sprint 1 · Ficha de obra y estimación paramétrica.
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'ana@estudio-a.com'),     -- dueña A
  ('22222222-2222-2222-2222-222222222222', 'beto@estudio-a.com'),    -- miembro A
  ('33333333-3333-3333-3333-333333333333', 'bruno@estudio-b.com'),   -- dueño B
  ('44444444-4444-4444-4444-444444444444', 'cliente@gmail.com');     -- invitado (cliente)

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

select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333"}', true);
insert into ids values ('org_b', public.create_organization('Estudio B'));
reset role;

-- Tipo de organización y funciones en prueba ---------------------------------
select is((select kind from public.organizations where id = (select v from ids where k = 'org_a')), 'studio',
  'Una organización nueva es un estudio');
select is((select count(*)::int from public.parametric_coefficients where org_id = (select v from ids where k = 'org_a')), 9,
  'Al crear la organización se siembran los coeficientes orientativos');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222"}', true);
select public.claim_invitations();
select throws_ok($$ select public.set_organization_kind((select v from ids where k = 'org_a'), 'builder') $$,
  '42501', null, 'Un miembro no cambia el tipo de organización');
select throws_ok($$ update public.organizations set beta_features = '{works}' where id = (select v from ids where k = 'org_a') $$,
  '42501', null, 'Nadie habilita funciones en prueba desde la app');

-- Sin la función habilitada, la ficha no se puede cargar.
select throws_ok($$ select public.upsert_work((select v from ids where k = 'p1'), 'works_director', null, null,
  2400, 180, 'multifamily', 'standard', null, null, 'USD') $$,
  '42501', null, 'Sin «works» en beta_features no se carga la ficha');

select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', true);
select lives_ok($$ select public.set_organization_kind((select v from ids where k = 'org_a'), 'builder') $$,
  'La dueña marca la organización como constructora');
reset role;
select is((select data ->> 'after' from public.events where type = 'organization.kind_changed'
           and org_id = (select v from ids where k = 'org_a')), 'builder',
  'El cambio de tipo deja un evento');

-- La plataforma habilita las funciones de obra (por SQL).
update public.organizations set beta_features = '{works}' where id in (select v from ids where k in ('org_a', 'org_b'));

-- Ficha de obra ----------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222"}', true);
select throws_ok($$ select public.upsert_work((select v from ids where k = 'p1'), null, null, null,
  2400, 180, 'multifamily', 'standard', null, null, 'USD') $$,
  '23502', null, 'El papel en la obra es obligatorio');
select throws_ok($$ select public.upsert_work((select v from ids where k = 'p1'), 'works_director', null, null,
  0, 180, 'multifamily', 'standard', null, null, 'USD') $$,
  '23514', null, 'Los m² cubiertos tienen que ser mayores que cero');
select throws_ok($$ select public.upsert_work((select v from ids where k = 'p1'), 'works_director', null, null,
  2400, 180, 'multifamily', 'standard', '2027-06-01', '2027-01-01', 'USD') $$,
  '23514', null, 'El fin previsto no puede ser anterior al inicio');

insert into ids select 'w1', public.upsert_work((select v from ids where k = 'p1'), 'works_director',
  'Av. Hipólito Yrigoyen 450', 'Córdoba', 2400, 180, 'multifamily', 'standard', '2027-03-01', '2028-09-30', 'USD');
select is(public.upsert_work((select v from ids where k = 'p1'), 'works_director',
  'Av. Hipólito Yrigoyen 450', 'Córdoba', 2450, 180, 'multifamily', 'standard', '2027-03-01', '2028-09-30', 'USD'),
  (select v from ids where k = 'w1'), 'Una sola ficha por proyecto: volver a guardarla la actualiza');
reset role;
select is((select covered_m2 from public.works where project_id = (select v from ids where k = 'p1')), 2450.00::numeric,
  'Guarda el cambio de m²');
select is((select count(*)::int from public.events where entity_id = (select v from ids where k = 'w1')
           and type in ('work.created', 'work.updated')), 2,
  'Queda un evento por el alta y otro por el cambio');

-- Otra organización, un invitado y escritura directa ---------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333"}', true);
select is((select count(*)::int from public.works), 0, 'Otra organización no lee la ficha');
select throws_ok($$ select public.upsert_work((select v from ids where k = 'p1'), 'builder', null, null,
  10, 0, 'office', 'high', null, null, 'ARS') $$,
  '42501', null, 'Otra organización no escribe la ficha');

select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444"}', true);
select public.claim_invitations();
select is((select count(*)::int from public.works), 0, 'El invitado del proyecto no lee la ficha');

select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222"}', true);
select throws_ok($$ update public.works set covered_m2 = 1 where project_id = (select v from ids where k = 'p1') $$,
  '42501', null, 'La ficha no se edita por fuera de upsert_work');

-- Presupuesto paramétrico -------------------------------------------------------
select throws_ok($$ select public.create_parametric_budget((select v from ids where k = 'p2'), 1503, '2026-06-01', 'APYMECO') $$,
  '22023', null, 'Sin ficha de obra no se estima');

-- Con los valores del seed: (2.450 + 180 × 0,5) × 1.503 × 1,05 × 1,00 = 4.008.501,00
select is((select number from public.create_parametric_budget((select v from ids where k = 'p1'), 1503, '2026-06-01',
  'Valor de ejemplo')), 1, 'El primer paramétrico es la versión 1');
reset role;
select results_eq(
  $$ select weighted_m2, total, cost_per_m2 from public.budget_totals where project_id = (select v from ids where k = 'p1') $$,
  $$ values (2540::numeric, 4008501.00::numeric, 1578.15::numeric) $$,
  'Total y costo por m² ponderado según la fórmula');
select is((select status || '/' || level from public.budgets where project_id = (select v from ids where k = 'p1')), 'draft/parametric',
  'Queda como borrador de nivel paramétrico');

-- Coeficiente y factor elegidos a mano; la versión siguiente no repite número.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', true);
select is((select number from public.create_parametric_budget((select v from ids where k = 'p1'), 1503, '2026-06-01',
  'Valor de ejemplo', 0.4, 1.10, 1.25)), 2, 'Dos altas seguidas no repiten número');
reset role;
select is((select total from public.budget_totals where project_id = (select v from ids where k = 'p1') and number = 2),
  round((2450 + 180 * 0.4) * 1503 * 1.10 * 1.25, 2), 'Usa el factor y los coeficientes elegidos');
select throws_ok($$ insert into public.budgets (org_id, project_id, number, level, currency, covered_m2, semicovered_m2,
                                               semicovered_factor, created_by)
  select org_id, project_id, 2, 'by_item', 'USD', 2450, 180, 0.5, created_by from public.budgets
  where project_id = (select v from ids where k = 'p1') limit 1 $$,
  '23505', null, 'La base no admite dos presupuestos con el mismo número en un proyecto');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333"}', true);
select is((select count(*)::int from public.budget_totals), 0, 'Otra organización no lee los presupuestos');

select * from finish();
rollback;
