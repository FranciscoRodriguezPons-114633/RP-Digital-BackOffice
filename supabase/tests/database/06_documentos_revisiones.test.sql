-- Sprint 3 · Documentos, revisiones y sus archivos.
begin;
create extension if not exists pgtap with schema extensions;
select plan(32);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'ana@estudio-a.com'),     -- dueña A
  ('22222222-2222-2222-2222-222222222222', 'beto@estudio-a.com'),    -- miembro A
  ('33333333-3333-3333-3333-333333333333', 'bruno@estudio-b.com'),   -- dueño B
  ('44444444-4444-4444-4444-444444444444', 'cliente@gmail.com');     -- cliente de A

create temp table ids (k text primary key, v uuid);
create temp table paths (k text primary key, v text);
grant select, insert, update on ids, paths to public;

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
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333"}', true);
select public.create_organization('Estudio B');

-- ---------- Documentos ----------
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222"}', true);
select public.claim_invitations();
insert into ids values ('d1', public.create_document((select v from ids where k = 'p1'), ' a-301 ', 'Planta baja', 'architecture'));
select is((select code from public.documents where id = (select v from ids where k = 'd1')), 'A-301', 'El código se guarda en mayúsculas');
select throws_ok($$ select public.create_document((select v from ids where k = 'p1'), 'A-301', 'Otra', 'architecture') $$,
  '23505', null, 'No se repite el código en el proyecto');
select throws_ok($$ insert into public.documents (org_id, project_id, code, title, created_by)
  select v, (select v from ids where k = 'p1'), 'X-1', 'Directo', '22222222-2222-2222-2222-222222222222' from ids where k = 'org_a' $$,
  '42501', null, 'No se crean documentos salteando la función');

-- ---------- Revisión y archivo ----------
insert into ids select 'r1', id from public.create_revision((select v from ids where k = 'd1'), 'c01', 'Planta baja (v1).pdf', 1000, 'application/pdf');
insert into paths select 'r1', storage_path from public.revisions where id = (select v from ids where k = 'r1');
select is((select v from paths where k = 'r1'),
  (select v::text from ids where k = 'org_a') || '/' || (select v::text from ids where k = 'p1') || '/' ||
  (select v::text from ids where k = 'd1') || '/' || (select v::text from ids where k = 'r1') || '/Planta-baja-v1-.pdf',
  'El archivo va a org/proyecto/documento/revisión/nombre-seguro');
select throws_ok($$ select public.publish_revision((select v from ids where k = 'r1')) $$,
  '22023', null, 'Sin archivo no se publica');
select throws_ok($$ select public.complete_revision_upload((select v from ids where k = 'r1'), repeat('a', 64)) $$,
  '22023', null, 'No se confirma una subida que no llegó a Storage');

select lives_ok($$ insert into storage.objects (bucket_id, name, owner, metadata)
  values ('documents', (select v from paths where k = 'r1'), '22222222-2222-2222-2222-222222222222', '{"size": 1234}') $$,
  'Un miembro sube el archivo al lugar de la revisión');
select throws_ok($$ insert into storage.objects (bucket_id, name, owner, metadata)
  values ('documents', 'cualquier/lugar.pdf', '22222222-2222-2222-2222-222222222222', '{}') $$,
  '42501', null, 'No se puede subir a cualquier lugar del bucket');
select throws_ok($$ select public.complete_revision_upload((select v from ids where k = 'r1'), 'no-es-un-hash') $$,
  '23514', null, 'La huella tiene que ser un SHA-256');
select lives_ok($$ select public.complete_revision_upload((select v from ids where k = 'r1'), repeat('a', 64)) $$,
  'Se confirma la subida con su huella');
select is((select file_size from public.revisions where id = (select v from ids where k = 'r1')), 1234::bigint,
  'El tamaño sale del archivo real');
select throws_ok($$ insert into storage.objects (bucket_id, name, owner, metadata)
  values ('documents', (select v from paths where k = 'r1') || '', '22222222-2222-2222-2222-222222222222', '{"size": 1}') $$,
  '42501', null, 'Con el archivo ya subido, no se puede subir otro encima');
update storage.objects set metadata = '{"size": 1}' where name = (select v from paths where k = 'r1');
select is((select metadata ->> 'size' from storage.objects where name = (select v from paths where k = 'r1')), '1234',
  'Tampoco se puede modificar el archivo subido');

-- ---------- Publicar y reemplazar ----------
select lives_ok($$ select public.publish_revision((select v from ids where k = 'r1')) $$, 'Beto publica C01');
select is((select status from public.revisions where id = (select v from ids where k = 'r1')), 'published', 'C01 publicada');

insert into ids select 'r2', id from public.create_revision((select v from ids where k = 'd1'), 'C02', 'planta.pdf', 2000, 'application/pdf');
insert into paths select 'r2', storage_path from public.revisions where id = (select v from ids where k = 'r2');
insert into storage.objects (bucket_id, name, owner, metadata)
values ('documents', (select v from paths where k = 'r2'), '22222222-2222-2222-2222-222222222222', '{"size": 2000}');
select public.complete_revision_upload((select v from ids where k = 'r2'), repeat('b', 64));
select lives_ok($$ select public.publish_revision((select v from ids where k = 'r2')) $$, 'Publicar C02');
select is((select status from public.revisions where id = (select v from ids where k = 'r1')), 'superseded',
  'C01 pasa a reemplazada');
select is((select count(*)::int from public.revisions where document_id = (select v from ids where k = 'd1') and status = 'published'), 1,
  'Hay una sola revisión publicada');
select is((select data ->> 'superseded_code' from public.events where type = 'revision.published' order by id desc limit 1), 'C01',
  'El evento dice qué revisión reemplazó');
select throws_ok($$ select public.publish_revision((select v from ids where k = 'r1')) $$,
  '22023', null, 'Una revisión reemplazada no se vuelve a publicar');
select throws_ok($$ select public.create_revision((select v from ids where k = 'd1'), 'C02', 'x.pdf', 10, 'application/pdf') $$,
  '23505', null, 'No se repite el código de revisión');
select throws_ok($$ select public.create_revision((select v from ids where k = 'd1'), 'C09', 'x.exe', 10, 'application/x-msdownload') $$,
  '23514', null, 'Solo PDF e imágenes');

reset role;
select throws_ok($$ update public.revisions set status = 'published' where id = (select v from ids where k = 'r1') $$,
  '23505', null, 'Ni a mano puede haber dos publicadas: lo impide el índice único');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222"}', true);

-- ---------- Descartar una subida cortada ----------
insert into ids select 'r3', id from public.create_revision((select v from ids where k = 'd1'), 'C03', 'x.pdf', 10, 'application/pdf');
select throws_ok($$ select public.discard_revision((select v from ids where k = 'r2')) $$,
  '22023', null, 'Una revisión con archivo no se descarta');
select lives_ok($$ select public.discard_revision((select v from ids where k = 'r3')) $$, 'Una sin archivo sí');

-- ---------- Quién ve qué ----------
select is((select count(*)::int from storage.objects where bucket_id = 'documents'), 2, 'Beto ve los archivos de su estudio');

select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333"}', true);
select is((select count(*)::int from public.documents) + (select count(*)::int from public.revisions)
          + (select count(*)::int from storage.objects where bucket_id = 'documents'), 0,
  'Otro estudio no ve documentos, revisiones ni archivos');
select throws_ok($$ select public.create_revision((select v from ids where k = 'd1'), 'C04', 'x.pdf', 10, 'application/pdf') $$,
  '42501', null, 'Otro estudio no sube revisiones');

select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444"}', true);
select is((select count(*)::int from public.documents) + (select count(*)::int from storage.objects where bucket_id = 'documents'), 0,
  'El cliente todavía no ve documentos (se comparten en el sprint 4)');

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select count(*) from public.documents $$, '42501', null, 'Sin sesión no se leen documentos');
select throws_ok($$ select public.create_document((select v from ids where k = 'p1'), 'Z', 'Zeta') $$,
  '42501', null, 'Sin sesión no se crean documentos');

reset role;
select is((select public from storage.buckets where id = 'documents'), false, 'El bucket es privado');

select * from finish();
rollback;
