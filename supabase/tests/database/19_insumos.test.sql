-- Finanzas de obra · Sprint 4 · Biblioteca de insumos: aislamiento, historial, importación y UOCRA.
begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'ana@estudio-a.com'),     -- dueña A
  ('22222222-2222-2222-2222-222222222222', 'beto@estudio-a.com'),    -- miembro A
  ('33333333-3333-3333-3333-333333333333', 'bruno@estudio-b.com'),   -- dueño B
  ('55555555-5555-5555-5555-555555555555', 'admin@plataforma.com');  -- plataforma
insert into public.platform_admins (user_id) values ('55555555-5555-5555-5555-555555555555');
delete from public.reference_value_revisions;
delete from public.reference_values;

create temp table ids (k text primary key, v uuid);
grant select, insert, update on ids to public;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', true);
insert into ids values ('org_a', public.create_organization('Constructora A'));
select public.invite_member((select v from ids where k = 'org_a'), 'beto@estudio-a.com', 'member');
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333"}', true);
insert into ids values ('org_b', public.create_organization('Estudio B'));
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222"}', true);
select public.claim_invitations();

-- Sin la función habilitada no hay insumos.
select throws_ok($$ select public.upsert_supply((select v from ids where k = 'org_a'), null, 'material', 'mat-001',
  'Cemento Portland x 50 kg', 'bolsa', 'ARS', 9500, '2026-11-01') $$,
  '42501', null, 'Sin «works» no se cargan insumos');
reset role;
update public.organizations set beta_features = '{works}' where id in (select v from ids where k in ('org_a', 'org_b'));
insert into public.parties (org_id, name, tax_id, roles, created_by) values
  ((select v from ids where k = 'org_a'), 'Corralón Sur', '30712345671', '{supplier}', '11111111-1111-1111-1111-111111111111'),
  ((select v from ids where k = 'org_a'), 'Comitente SA', '30500000003', '{client}', '11111111-1111-1111-1111-111111111111');

-- Alta, edición e historial ---------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222"}', true);
insert into ids select 'cem', public.upsert_supply((select v from ids where k = 'org_a'), null, 'material', ' mat-001 ',
  'Cemento Portland x 50 kg', 'bolsa', 'ARS', 9500, '2026-11-01',
  (select id from public.parties where name = 'Corralón Sur'));
select is((select code from public.supplies where id = (select v from ids where k = 'cem')), 'MAT-001',
  'Un miembro carga un insumo y el código queda en mayúsculas');
select is((select count(*)::int from public.supply_prices where supply_id = (select v from ids where k = 'cem')), 1,
  'El primer precio queda en el historial');
select throws_ok($$ select public.upsert_supply((select v from ids where k = 'org_a'), null, 'material', 'MAT-001',
  'Otro cemento', 'bolsa', 'ARS', 1, '2026-11-01') $$,
  '23505', null, 'El código no se repite en la organización');
select throws_ok($$ select public.upsert_supply((select v from ids where k = 'org_a'), null, 'material', 'MAT-002',
  'Arena', 'm3', 'ARS', 0, '2026-11-01') $$,
  '23514', null, 'El precio tiene que ser mayor que cero');
select throws_ok($$ select public.upsert_supply((select v from ids where k = 'org_a'), null, 'material', 'MAT-002',
  'Arena', 'm3', 'ARS', 100, '2026-11-01', (select id from public.parties where name = 'Comitente SA')) $$,
  '23514', null, 'El proveedor tiene que tener el rol de proveedor');

select public.upsert_supply((select v from ids where k = 'org_a'), (select v from ids where k = 'cem'), 'material',
  'MAT-001', 'Cemento Portland x 50 kg', 'bolsa', 'ARS', 9800, '2026-11-10');
select results_eq(
  $$ select price, price_date, source from public.supply_prices
     where supply_id = (select v from ids where k = 'cem') order by id $$,
  $$ values (9500.0000::numeric, '2026-11-01'::date, 'manual'::text), (9800.0000::numeric, '2026-11-10'::date, 'manual'::text) $$,
  'Un cambio de precio deja el anterior en el historial');
select public.upsert_supply((select v from ids where k = 'org_a'), (select v from ids where k = 'cem'), 'material',
  'MAT-001', 'Cemento Portland CPC40 x 50 kg', 'bolsa', 'ARS', 9800, '2026-11-10');
select is((select count(*)::int from public.supply_prices where supply_id = (select v from ids where k = 'cem')), 2,
  'Cambiar el nombre no suma historial');
select throws_ok($$ update public.supplies set price = 1 where code = 'MAT-001' $$,
  '42501', null, 'El precio no se toca directo en la tabla');
select throws_ok($$ delete from public.supply_prices $$, '42501', null, 'El historial es de solo inserción');

select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333"}', true);
select is((select count(*)::int from public.supplies), 0, 'Otra organización no ve los insumos');
select is((select count(*)::int from public.supply_prices), 0, 'Ni su historial');
select throws_ok($$ select public.upsert_supply((select v from ids where k = 'org_a'), null, 'material', 'X-1',
  'Ajeno', 'u', 'ARS', 1, '2026-11-01') $$,
  '42501', null, 'Ni carga insumos en una organización ajena');

-- Importación -----------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222"}', true);
select throws_ok($$ select public.import_supplies((select v from ids where k = 'org_a'),
  '[{"line":2,"kind":"material","code":"MAT-010","name":"Cal","unit":"bolsa","currency":"ARS","price":4000,"price_date":"2026-11-01"}]') $$,
  '42501', null, 'Un miembro no importa listas de precios');

select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', true);
create temp table import_rows (j jsonb);
grant select on import_rows to public;
insert into import_rows values ('[
  {"line":2,"kind":"material","code":"mat-001","name":"Cemento","unit":"bolsa","currency":"ARS","price":10200,"price_date":"2026-11-12"},
  {"line":3,"kind":"material","code":"MAT-010","name":"Cal hidráulica x 25 kg","unit":"bolsa","currency":"ARS","price":4000,"price_date":"2026-11-12","supplier_tax_id":"30-71234567-1"},
  {"line":4,"kind":"equipment","code":"EQ-001","name":"Hormigonera 130 l","unit":"día","currency":"USD","price":12.5,"price_date":"2026-11-12"},
  {"line":5,"kind":"material","code":"MAT-011","name":"Arena","unit":"m3","currency":"ARS","price":-5,"price_date":"2026-11-12"},
  {"line":6,"kind":"material","code":"MAT-012","name":"Piedra","unit":"m3","currency":"ARS","price":30000,"price_date":"2026-11-12","supplier_tax_id":"20123456786"},
  {"line":7,"kind":"material","code":"MAT-010","name":"Cal repetida","unit":"bolsa","currency":"ARS","price":4100,"price_date":"2026-11-12"}
]');
select is(public.import_supplies((select v from ids where k = 'org_a'), (select j from import_rows), true)
            - 'errors',
  '{"inserted": 2, "updated": 1, "unchanged": 0}'::jsonb, 'La vista previa cuenta altas y cambios de precio');
select is((select count(*)::int from public.supplies), 1, 'La vista previa no escribe nada');

select is(public.import_supplies((select v from ids where k = 'org_a'), (select j from import_rows)) -> 'errors',
  '[{"line": 5, "message": "Datos inválidos"},
    {"line": 6, "message": "No hay un proveedor con ese CUIT en Terceros"},
    {"line": 7, "message": "El código está repetido en la lista"}]'::jsonb,
  'Las filas inválidas vuelven como errores y no se importan');
select is((select count(*)::int from public.supplies), 3, 'Se importan las filas válidas');
select results_eq(
  $$ select s.name, s.price, (select count(*)::int from public.supply_prices sp where sp.supply_id = s.id)
     from public.supplies s where s.code = 'MAT-001' $$,
  $$ values ('Cemento Portland CPC40 x 50 kg'::text, 10200.0000::numeric, 3) $$,
  'Si el código existe se actualiza el precio (queda en el historial) sin pisar el nombre');
select is((select p.name from public.supplies s join public.parties p on p.id = s.supplier_party_id where s.code = 'MAT-010'),
  'Corralón Sur', 'El proveedor se vincula por CUIT');
select is(public.import_supplies((select v from ids where k = 'org_a'),
  '[{"line":2,"kind":"material","code":"MAT-001","name":"Cemento","unit":"bolsa","currency":"ARS","price":10200,"price_date":"2026-11-12"}]')
    - 'errors',
  '{"inserted": 0, "updated": 0, "unchanged": 1}'::jsonb, 'Importar el mismo precio no cambia nada');
select is((select count(*)::int from public.events where type = 'supplies.imported'), 1,
  'La importación deja un solo evento');

-- Mano de obra desde UOCRA ----------------------------------------------------------
select throws_ok($$ select public.upsert_supply((select v from ids where k = 'org_a'), null, 'labor', 'MO-OF',
  'Oficial', 'h', 'ARS', null, null, null, 'uocra_oficial') $$,
  '22023', null, 'No se ata a una serie que todavía no tiene valores');
select throws_ok($$ select public.upsert_supply((select v from ids where k = 'org_a'), null, 'material', 'MAT-099',
  'Hierro', 'kg', 'ARS', null, null, null, 'uocra_oficial') $$,
  '22023', null, 'Solo la mano de obra toma el precio de una escala');

select set_config('request.jwt.claims', '{"sub":"55555555-5555-5555-5555-555555555555"}', true);
select * from public.load_reference_values('uocra_oficial',
  '[{"period":"2026-09-01","value":4000},{"period":"2026-10-01","value":4400}]');
set constraints all immediate;
set constraints all deferred;

select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', true);
insert into public.labor_settings (org_id, valid_from, charges_pct, created_by)
values ((select v from ids where k = 'org_a'), '2026-01-01', 50, '11111111-1111-1111-1111-111111111111');
insert into ids select 'of', public.upsert_supply((select v from ids where k = 'org_a'), null, 'labor', 'MO-OF',
  'Oficial', 'h', 'USD', 1, '2020-01-01', null, 'uocra_oficial');
select results_eq(
  $$ select price, currency, price_date from public.supplies where id = (select v from ids where k = 'of') $$,
  $$ values (6600.0000::numeric, 'ARS'::text, '2026-10-01'::date) $$,
  'El precio sale de la escala: 4400 × (1 + 50 %), en pesos y con la fecha del valor');

-- Nueva paritaria: tres meses en una sola carga.
select set_config('request.jwt.claims', '{"sub":"55555555-5555-5555-5555-555555555555"}', true);
select * from public.load_reference_values('uocra_oficial',
  '[{"period":"2026-11-01","value":4800},{"period":"2026-12-01","value":5000},{"period":"2027-01-01","value":5200}]');
set constraints all immediate;
set constraints all deferred;

select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', true);
select is((select price from public.supplies where id = (select v from ids where k = 'of')), 7800.0000::numeric,
  'Al cargarse la paritaria, el precio se actualiza solo (5200 × 1,5)');
select results_eq(
  $$ select price, source from public.supply_prices where supply_id = (select v from ids where k = 'of') order by id $$,
  $$ values (6600.0000::numeric, 'series'::text), (7800.0000::numeric, 'series'::text) $$,
  'Una carga de varios meses deja un solo cambio en el historial');

update public.labor_settings set charges_pct = 60 where org_id = (select v from ids where k = 'org_a');
select is((select price from public.supplies where id = (select v from ids where k = 'of')), 8320.0000::numeric,
  'Cambiar las cargas recalcula la mano de obra (5200 × 1,6)');
select throws_ok($$ insert into public.labor_settings (org_id, valid_from, charges_pct, created_by)
  values ((select v from ids where k = 'org_a'), '2099-01-01', 70, '11111111-1111-1111-1111-111111111111') $$,
  '23514', null, 'La vigencia de las cargas no puede ser futura');
select is(public.import_supplies((select v from ids where k = 'org_a'),
  '[{"line":2,"kind":"labor","code":"MO-OF","name":"Oficial","unit":"h","currency":"ARS","price":1,"price_date":"2026-11-12"}]')
    -> 'errors' -> 0 ->> 'message',
  'Ese insumo toma el precio de una escala salarial: no se importa',
  'Una importación no pisa un precio atado a la escala');

select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222"}', true);
select throws_ok($$ insert into public.labor_settings (org_id, valid_from, charges_pct, created_by)
  values ((select v from ids where k = 'org_a'), '2026-06-01', 10, '22222222-2222-2222-2222-222222222222') $$,
  '42501', null, 'Un miembro no cambia las cargas');
reset role;

select * from finish();
rollback;
