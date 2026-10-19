-- Sprint 4 · Comentarios por archivo.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'ana@estudio-a.com'),     -- dueña A
  ('33333333-3333-3333-3333-333333333333', 'bruno@estudio-b.com'),   -- dueño B
  ('44444444-4444-4444-4444-444444444444', 'cliente@gmail.com'),     -- cliente: le enviaron la C01
  ('55555555-5555-5555-5555-555555555555', 'rita@render.com'),       -- renderista: responsable del render
  ('66666666-6666-6666-6666-666666666666', 'mario@gmail.com');       -- invitado sin archivos enviados

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
select public.invite_guest((select v from ids where k = 'p1'), 'cliente@gmail.com', 'client');
select public.invite_guest((select v from ids where k = 'p1'), 'rita@render.com', 'renderer');
select public.invite_guest((select v from ids where k = 'p1'), 'mario@gmail.com', 'contractor');
insert into ids values ('d1', public.create_document((select v from ids where k = 'p1'), 'A-101', 'Planta baja'));
insert into ids select 'r1', id from public.create_revision((select v from ids where k = 'd1'), 'C01', 'c01.pdf', 10, 'application/pdf');
reset role;
insert into storage.objects (bucket_id, name, metadata)
select 'documents', storage_path, '{"size": 10}' from public.revisions where id = (select v from ids where k = 'r1');
set local role authenticated;
select public.complete_revision_upload((select v from ids where k = 'r1'), repeat('a', 64));
select public.publish_revision((select v from ids where k = 'r1'));
insert into ids values ('dep1', public.create_dependency((select v from ids where k = 'r1'), 'render', 'Render hall', 'rita@render.com'));
select public.send_shipment((select v from ids where k = 'p1'), 'cliente@gmail.com', array[(select v from ids where k = 'r1')]);

-- ---------- Comentar ----------
select lives_ok($$ insert into ids values ('c_ana', public.add_comment((select v from ids where k = 'r1'), null,
  'Falta acotar la escalera', 2)) $$, 'La dueña comenta la página 2 de la C01');
select throws_ok($$ select public.add_comment((select v from ids where k = 'r1'), null, '   ') $$,
  '23514', null, 'Un comentario vacío no se guarda');
select throws_ok($$ select public.add_comment((select v from ids where k = 'r1'), (select v from ids where k = 'dep1'), 'x') $$,
  '23514', null, 'Un comentario va a un solo archivo');

select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444"}', true);
select lives_ok($$ insert into ids values ('c_cli', public.add_comment((select v from ids where k = 'r1'), null,
  '¿Se puede correr la puerta?')) $$, 'El cliente comenta la revisión que le enviaron');
select is((select count(*)::int from public.comments), 2, 'Y ve los comentarios de esa revisión');
select throws_ok($$ select public.resolve_comment((select v from ids where k = 'c_ana')) $$,
  '42501', null, 'No resuelve comentarios ajenos');
select lives_ok($$ select public.resolve_comment((select v from ids where k = 'c_cli')) $$, 'Resuelve el suyo');
reset role;
select is((select to_email from public.outbox where kind = 'comment_added' and org_id = (select v from ids where k = 'org_a')),
  'ana@estudio-a.com', 'El comentario de un invitado le avisa a la dueña');
set local role authenticated;

select set_config('request.jwt.claims', '{"sub":"55555555-5555-5555-5555-555555555555"}', true);
select lives_ok($$ select public.add_comment(null, (select v from ids where k = 'dep1'), 'Entrego el viernes') $$,
  'La renderista comenta su pieza');
select is((select count(*)::int from public.comments), 1, 'Ve solo los comentarios de su pieza');
select throws_ok($$ select public.add_comment((select v from ids where k = 'r1'), null, 'Hola') $$,
  '42501', null, 'No comenta una revisión que no le enviaron');

select set_config('request.jwt.claims', '{"sub":"66666666-6666-6666-6666-666666666666"}', true);
select is((select count(*)::int from public.comments), 0, 'Un invitado sin archivos no ve comentarios');

select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', true);
select is((select count(*)::int from public.comments), 3, 'La dueña ve todos los del proyecto');
select lives_ok($$ select public.resolve_comment((select v from ids where k = 'c_ana')) $$, 'Y resuelve el suyo');

select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333"}', true);
select is((select count(*)::int from public.comments), 0, 'Otro estudio no ve comentarios');
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select count(*) from public.comments $$, '42501', null, 'Sin sesión no se leen comentarios');

select * from finish();
rollback;
