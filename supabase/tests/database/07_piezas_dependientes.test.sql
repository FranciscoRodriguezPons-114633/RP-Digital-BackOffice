-- Sprint 4 · Piezas dependientes y "a revisar".
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'ana@estudio-a.com'),     -- dueña A
  ('22222222-2222-2222-2222-222222222222', 'beto@estudio-a.com'),    -- miembro A
  ('33333333-3333-3333-3333-333333333333', 'bruno@estudio-b.com'),   -- dueño B
  ('55555555-5555-5555-5555-555555555555', 'rita@render.com');       -- renderista de A

create temp table ids (k text primary key, v uuid);
create temp table paths (k text primary key, v text);
grant select, insert, update on ids, paths to public;

-- Sube y publica una revisión como la usuaria actual (simula el archivo en Storage).
create function pg_temp.publish(p_doc uuid, p_code text) returns uuid language plpgsql as $$
declare v_id uuid; v_path text;
begin
  select id, storage_path into v_id, v_path from public.create_revision(p_doc, p_code, p_code || '.pdf', 10, 'application/pdf');
  insert into storage.objects (bucket_id, name, metadata) values ('documents', v_path, '{"size": 10}');
  perform public.complete_revision_upload(v_id, repeat('a', 64));
  perform public.publish_revision(v_id);
  return v_id;
end $$;
grant execute on function pg_temp.publish(uuid, text) to public;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', true);
insert into ids values ('org_a', public.create_organization('Estudio A'));
with x as (
  insert into public.projects (org_id, name, created_by)
  select v, 'Edificio Alba', '11111111-1111-1111-1111-111111111111' from ids where k = 'org_a'
  returning id)
insert into ids select 'p1', id from x;
select public.invite_member((select v from ids where k = 'org_a'), 'beto@estudio-a.com', 'member');
select public.invite_guest((select v from ids where k = 'p1'), 'rita@render.com', 'renderer');
insert into ids values ('d1', public.create_document((select v from ids where k = 'p1'), 'A-201', 'Fachada norte'));
insert into ids values ('r1', pg_temp.publish((select v from ids where k = 'd1'), 'C01'));
insert into ids select 'draft', id from public.create_revision((select v from ids where k = 'd1'), 'C09', 'x.pdf', 10, 'application/pdf');

-- ---------- Crear piezas ----------
select lives_ok($$ insert into ids values ('dep1', public.create_dependency((select v from ids where k = 'r1'), 'render',
  'Render fachada norte', ' Rita@Render.com ', 3)) $$, 'La dueña crea un render sobre la C01, a cargo de Rita');
select throws_ok($$ select public.create_dependency((select v from ids where k = 'draft'), 'render', 'Sobre borrador') $$,
  '22023', null, 'Una pieza se hace sobre la revisión vigente');
insert into ids values ('dep2', public.create_dependency((select v from ids where k = 'r1'), 'sales_plan', 'Plano de venta piso 3'));
select throws_ok($$ insert into public.dependencies (org_id, project_id, source_revision_id, kind, title, created_by)
  select v, (select v from ids where k = 'p1'), (select v from ids where k = 'r1'), 'render', 'Directa',
         '11111111-1111-1111-1111-111111111111' from ids where k = 'org_a' $$,
  '42501', null, 'No se crean piezas salteando la función');

-- ---------- La renderista entrega su archivo ----------
select set_config('request.jwt.claims', '{"sub":"55555555-5555-5555-5555-555555555555"}', true);
select public.claim_invitations();
select is((select count(*)::int from public.dependencies), 1, 'Rita ve solo la pieza a su cargo');
select is((select count(*)::int from public.revisions), 0, 'Y no ve las revisiones internas');
insert into paths values ('dep1', public.attach_dependency_file((select v from ids where k = 'dep1'), 'Render final.jpg', 500, 'image/jpeg'));
select ok((select v from paths where k = 'dep1') like '%/piezas/' || (select v::text from ids where k = 'dep1') || '/Render-final.jpg',
  'El archivo de la pieza va a org/proyecto/piezas/pieza/archivo');
select lives_ok($$ insert into storage.objects (bucket_id, name, metadata)
  values ('documents', (select v from paths where k = 'dep1'), '{"size": 480}') $$, 'Rita sube el render');
select lives_ok($$ select public.complete_dependency_upload((select v from ids where k = 'dep1'), repeat('c', 64)) $$,
  'Y confirma la entrega');
select is((select file_size from public.dependencies where id = (select v from ids where k = 'dep1')), 480::bigint,
  'El tamaño sale del archivo real');
select throws_ok($$ select public.attach_dependency_file((select v from ids where k = 'dep1'), 'otro.jpg', 10, 'image/jpeg') $$,
  '22023', null, 'Un archivo entregado no se reemplaza');
select throws_ok($$ select public.attach_dependency_file((select v from ids where k = 'dep2'), 'x.pdf', 10, 'application/pdf') $$,
  '42501', null, 'Rita no toca piezas que no son suyas');

-- ---------- Publicar la C02 marca las piezas ----------
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', true);
insert into ids values ('r2', pg_temp.publish((select v from ids where k = 'd1'), 'C02'));
select is((select array_agg(status order by title) from public.dependencies), array['to_review', 'to_review'],
  'Publicada la C02, las dos piezas de la C01 quedan a revisar');
select is((select count(*)::int from public.events where type = 'dependency.to_review'), 2, 'Un evento por pieza');
select is((select (data ->> 'dependencies_to_review')::int from public.events where type = 'revision.published'
           order by id desc limit 1), 2, 'El evento de publicación cuenta las piezas afectadas');
reset role;
select is((select array_agg(to_email order by to_email) from public.outbox where kind = 'dependency_to_review'),
  array['ana@estudio-a.com', 'rita@render.com'],
  'Aviso a Rita por su render y a la dueña por la pieza sin responsable');
set local role authenticated;

-- ---------- Decidir ----------
select set_config('request.jwt.claims', '{"sub":"55555555-5555-5555-5555-555555555555"}', true);
select throws_ok($$ select public.review_dependency((select v from ids where k = 'dep1'), 'revalidated') $$,
  '42501', null, 'La responsable externa no decide si la pieza sigue sirviendo');

select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222"}', true);
select public.claim_invitations();
select throws_ok($$ select public.review_dependency((select v from ids where k = 'dep1'), 'quizás') $$,
  '23514', null, 'Decisión inválida');
select lives_ok($$ select public.review_dependency((select v from ids where k = 'dep1'), 'revalidated') $$,
  'Beto revalida el render: sigue sirviendo con la C02');
select is((select source_revision_id from public.dependencies where id = (select v from ids where k = 'dep1')),
  (select v from ids where k = 'r2'), 'Revalidada, la pieza pasa a depender de la C02');
select lives_ok($$ select public.review_dependency((select v from ids where k = 'dep2'), 'obsolete') $$,
  'El plano de venta queda obsoleto');
select throws_ok($$ select public.review_dependency((select v from ids where k = 'dep2'), 'revalidated') $$,
  '22023', null, 'Solo se decide sobre piezas a revisar');

-- La C03 vuelve a marcar el render revalidado; el obsoleto queda como está.
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', true);
select pg_temp.publish((select v from ids where k = 'd1'), 'C03');
select is((select array_agg(status order by title) from public.dependencies), array['obsolete', 'to_review'],
  'La C03 marca de nuevo el render; el plano obsoleto no cambia');

-- ---------- Aislamiento ----------
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333"}', true);
select public.create_organization('Estudio B');
select is((select count(*)::int from public.dependencies), 0, 'Otro estudio no ve piezas');
select throws_ok($$ select public.create_dependency((select v from ids where k = 'r2'), 'render', 'Ajena') $$,
  '42501', null, 'Ni las crea');

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select count(*) from public.dependencies $$, '42501', null, 'Sin sesión no se leen piezas');

select * from finish();
rollback;
