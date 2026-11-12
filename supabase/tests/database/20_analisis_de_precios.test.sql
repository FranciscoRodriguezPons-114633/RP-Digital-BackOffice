-- Finanzas de obra · Sprint 5 · Análisis de precios: cálculo, aislamiento y copia del catálogo.
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'ana@estudio-a.com'),     -- dueña A
  ('22222222-2222-2222-2222-222222222222', 'beto@estudio-a.com'),    -- miembro A
  ('33333333-3333-3333-3333-333333333333', 'bruno@estudio-b.com');   -- dueño B
delete from public.catalog_unit_analyses;

create temp table ids (k text primary key, v uuid);
grant select, insert, update on ids to public;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', true);
insert into ids values ('org_a', public.create_organization('Constructora A'));
select public.invite_member((select v from ids where k = 'org_a'), 'beto@estudio-a.com', 'member');
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333"}', true);
insert into ids values ('org_b', public.create_organization('Constructora B'));
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222"}', true);
select public.claim_invitations();
reset role;
update public.organizations set beta_features = '{works}' where id in (select v from ids where k in ('org_a', 'org_b'));

-- Insumos de A (como Beto) y uno de B.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222"}', true);
insert into ids select 'lad', public.upsert_supply((select v from ids where k = 'org_a'), null, 'material', 'LAD-H18', 'Ladrillo hueco 18x18x33', 'u', 'ARS', 320, '2026-11-01');
insert into ids select 'cem', public.upsert_supply((select v from ids where k = 'org_a'), null, 'material', 'CEM-PORT', 'Cemento Portland', 'kg', 'ARS', 190, '2026-11-01');
insert into ids select 'are', public.upsert_supply((select v from ids where k = 'org_a'), null, 'material', 'ARENA', 'Arena fina', 'm3', 'ARS', 42000, '2026-11-01');
insert into ids select 'ofi', public.upsert_supply((select v from ids where k = 'org_a'), null, 'labor', 'MO-OFICIAL', 'Oficial', 'h', 'ARS', 6743.75, '2026-11-01');
insert into ids select 'ayu', public.upsert_supply((select v from ids where k = 'org_a'), null, 'labor', 'MO-AYUDANTE', 'Ayudante', 'h', 'ARS', 5720, '2026-11-01');
insert into ids select 'and', public.upsert_supply((select v from ids where k = 'org_a'), null, 'equipment', 'EQ-ANDAMIO', 'Andamio tubular', 'día', 'USD', 3.75, '2026-11-01');
insert into ids select 'cap', public.upsert_supply((select v from ids where k = 'org_a'), null, 'staff', 'PER-CAPATAZ', 'Capataz', 'mes', 'ARS', 1500000, '2026-11-01');
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333"}', true);
insert into ids select 'lad_b', public.upsert_supply((select v from ids where k = 'org_b'), null, 'material', 'LAD-H18', 'Ladrillo de B', 'u', 'ARS', 999, '2026-11-01');

-- Alta del análisis ------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222"}', true);
with x as (
  insert into public.unit_analyses (org_id, code, name, unit, chapter, default_waste_pct, created_by)
  values ((select v from ids where k = 'org_a'), ' mam-h18 ', 'Mampostería de ladrillo hueco 18 cm', 'm2', 'Mampostería', 5,
          '22222222-2222-2222-2222-222222222222')
  returning id, code)
insert into ids select 'apu', id from x;
select is((select code from public.unit_analyses where id = (select v from ids where k = 'apu')), 'MAM-H18',
  'Un miembro crea un análisis y el código queda en mayúsculas');
select throws_ok($$ insert into public.unit_analyses (org_id, code, name, unit, chapter, created_by)
  values ((select v from ids where k = 'org_a'), 'MAM-H18', 'Otra', 'm2', 'Mampostería', '22222222-2222-2222-2222-222222222222') $$,
  '23505', null, 'El código no se repite en la organización');
select throws_ok($$ insert into public.unit_analyses (org_id, code, name, unit, chapter, origin, created_by)
  values ((select v from ids where k = 'org_a'), 'X-1', 'Trucho', 'm2', 'Mampostería', 'catalog', '22222222-2222-2222-2222-222222222222') $$,
  '42501', null, 'A mano solo se crean análisis propios');

-- Componentes ------------------------------------------------------------------------
select throws_ok($$ insert into public.unit_analysis_components (analysis_id, supply_id, yield)
  values ((select v from ids where k = 'apu'), (select v from ids where k = 'lad'), 15.5) $$,
  '42501', null, 'Los componentes no se escriben directo en la tabla');
select throws_ok(format($$ select public.set_unit_analysis_components(%L, '[{"supply_id":"%s","yield":15.5,"waste_pct":5}]') $$,
  (select v from ids where k = 'apu'), (select v from ids where k = 'lad_b')),
  '23514', null, 'No acepta insumos de otra organización');
select throws_ok(format($$ select public.set_unit_analysis_components(%L, '[{"supply_id":"%s","yield":0.01}]') $$,
  (select v from ids where k = 'apu'), (select v from ids where k = 'cap')),
  '23514', null, 'El personal no va en un análisis de precios');
select throws_ok(format($$ select public.set_unit_analysis_components(%L, '[{"supply_id":"%s","yield":0}]') $$,
  (select v from ids where k = 'apu'), (select v from ids where k = 'lad')),
  '23514', null, 'El rendimiento tiene que ser mayor que cero');
select throws_ok(format($$ select public.set_unit_analysis_components(%L, '[{"supply_id":"%s","yield":1},{"supply_id":"%s","yield":2}]') $$,
  (select v from ids where k = 'apu'), (select v from ids where k = 'lad'), (select v from ids where k = 'lad')),
  '22023', null, 'Un insumo no se repite en el análisis');

select is(public.set_unit_analysis_components((select v from ids where k = 'apu'), (
  select jsonb_agg(jsonb_build_object('supply_id', i.v, 'yield', t.y, 'waste_pct', t.w) order by t.n)
  from (values (1, 'lad', 15.5, 5), (2, 'cem', 4.2, 5), (3, 'are', 0.03, 10), (4, 'ofi', 0.8, 0), (5, 'ayu', 0.6, 0),
               (6, 'and', 0.05, 0)) as t (n, k, y, w)
  join ids i on i.k = t.k)), 6, 'Se guardan los seis componentes');

-- Ladrillo 15,5 × 1,05 × 320 = 5208; cemento 4,2 × 1,05 × 190 = 837,90; arena 0,03 × 1,10 × 42000 = 1386.
-- Oficial 0,8 × 6743,75 = 5395; ayudante 0,6 × 5720 = 3432. Andamio 0,05 × 3,75 = 0,1875 → 0,19 (USD).
select results_eq(
  $$ select currency, materials, labor, equipment, total, components, unpriced_components
     from public.unit_analysis_costs where analysis_id = (select v from ids where k = 'apu') order by currency $$,
  $$ values ('ARS'::text, 7431.90::numeric, 8827.00::numeric, 0.00::numeric, 16258.90::numeric, 5, 0),
            ('USD'::text, 0.00::numeric, 0.00::numeric, 0.19::numeric, 0.19::numeric, 1, 0) $$,
  'Costo por unidad separado en materiales, mano de obra y equipos, por moneda');

-- Cambia solo al cambiar un precio.
select public.upsert_supply((select v from ids where k = 'org_a'), (select v from ids where k = 'lad'), 'material',
  'LAD-H18', 'Ladrillo hueco 18x18x33', 'u', 'ARS', 350, '2026-11-12');
select is((select materials from public.unit_analysis_costs
           where analysis_id = (select v from ids where k = 'apu') and currency = 'ARS'), 7920.15::numeric,
  'Al cambiar el precio del ladrillo, el costo cambia solo (15,5 × 1,05 × 350 = 5696,25)');

-- Reemplazo de la lista: saca el andamio y cambia un rendimiento.
select is(public.set_unit_analysis_components((select v from ids where k = 'apu'), (
  select jsonb_agg(jsonb_build_object('supply_id', i.v, 'yield', t.y, 'waste_pct', t.w) order by t.n)
  from (values (1, 'lad', 16, 5), (2, 'cem', 4.2, 5), (3, 'are', 0.03, 10), (4, 'ofi', 0.8, 0), (5, 'ayu', 0.6, 0)) as t (n, k, y, w)
  join ids i on i.k = t.k)), 5, 'Guardar de nuevo reemplaza la lista');
select is((select count(*)::int from public.unit_analysis_costs where analysis_id = (select v from ids where k = 'apu')), 1,
  'El componente que se sacó ya no cuenta');
select throws_ok($$ delete from public.supplies where code = 'LAD-H18' $$,
  '42501', null, 'Un insumo no se borra desde la app');

select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333"}', true);
select is((select count(*)::int from public.unit_analyses), 0, 'Otra organización no ve los análisis');
select is((select count(*)::int from public.unit_analysis_costs), 0, 'Ni sus costos');
select throws_ok(format($$ select public.set_unit_analysis_components(%L, '[]') $$, (select v from ids where k = 'apu')),
  '42501', null, 'Ni toca sus componentes');

-- Catálogo -----------------------------------------------------------------------------
reset role;
insert into public.catalog_unit_analyses (code, name, unit, chapter, default_waste_pct) values
  ('CAT-MAM-H12', 'Mampostería de ladrillo hueco 12 cm', 'm2', 'Mampostería', 5),
  ('MAM-H18', 'Mampostería de ladrillo hueco 18 cm', 'm2', 'Mampostería', 5);
insert into public.catalog_components (analysis_code, supply_code, supply_name, supply_kind, supply_unit, yield, waste_pct, position) values
  ('CAT-MAM-H12', 'LAD-H12', 'Ladrillo hueco 12x18x33', 'material', 'u', 15.5, 5, 1),
  ('CAT-MAM-H12', 'CEM-PORT', 'Cemento Portland', 'material', 'kg', 3.1, 5, 2),
  ('CAT-MAM-H12', 'MO-OFICIAL', 'Oficial', 'labor', 'h', 0.7, 0, 3),
  ('MAM-H18', 'LAD-H18', 'Ladrillo hueco 18x18x33', 'material', 'u', 15.5, 5, 1);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222"}', true);
select is((select count(*)::int from public.catalog_unit_analyses), 2, 'Cualquier miembro lee el catálogo');
select throws_ok($$ select public.import_catalog_analyses((select v from ids where k = 'org_a'), '{CAT-MAM-H12}') $$,
  '42501', null, 'Un miembro no importa del catálogo');
select throws_ok($$ update public.catalog_unit_analyses set name = 'Cambiado' $$,
  '42501', null, 'Nadie edita el catálogo desde la app');

select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', true);
select is(public.import_catalog_analyses((select v from ids where k = 'org_a'), '{CAT-MAM-H12,MAM-H18}'),
  '{"imported": 1, "skipped": 1, "supplies_created": 1}'::jsonb,
  'Importa lo nuevo, saltea el código que ya existe y crea el insumo que falta');
select results_eq(
  $$ select s.code, s.price, s.currency from public.supplies s where s.code = 'LAD-H12' $$,
  $$ values ('LAD-H12'::text, null::numeric, 'ARS'::text) $$,
  'El insumo que no estaba se crea sin precio');
-- Cemento 3,1 × 1,05 × 190 = 618,45 (el ladrillo sin precio no suma); oficial 0,7 × 6743,75 = 4720,63.
select results_eq(
  $$ select c.materials, c.labor, c.components, c.unpriced_components
     from public.unit_analysis_costs c join public.unit_analyses a on a.id = c.analysis_id where a.code = 'CAT-MAM-H12' $$,
  $$ values (618.45::numeric, 4720.63::numeric, 3, 1) $$,
  'Los insumos propios se emparejan por código y el costo avisa que hay uno sin precio');

-- La copia es independiente del catálogo.
reset role;
update public.catalog_components set yield = 99 where analysis_code = 'CAT-MAM-H12';
delete from public.catalog_unit_analyses where code = 'CAT-MAM-H12';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', true);
select is((select count(*)::int from public.unit_analysis_components c join public.unit_analyses a on a.id = c.analysis_id
           where a.code = 'CAT-MAM-H12' and c.yield < 99), 3,
  'Cambiar o borrar el catálogo no toca la copia');
update public.unit_analyses set name = 'Mampostería 12 cm (adaptada)' where code = 'CAT-MAM-H12';
select is((select name from public.unit_analyses where code = 'CAT-MAM-H12'), 'Mampostería 12 cm (adaptada)',
  'La copia se adapta como cualquier análisis propio');
reset role;

select * from finish();
rollback;
