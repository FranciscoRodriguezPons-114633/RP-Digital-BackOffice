-- Sprint 5 · Comentarios anclados y rondas de una pieza.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'ana@estudio-a.com'),
  ('55555555-5555-5555-5555-555555555555', 'rita@render.com');

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
select public.invite_guest((select v from ids where k = 'p1'), 'rita@render.com', 'renderer');
insert into ids values ('d1', public.create_document((select v from ids where k = 'p1'), 'A-101', 'Planta'));
insert into ids select 'r1', id from public.create_revision((select v from ids where k = 'd1'), 'C01', 'c01.pdf', 10, 'application/pdf');
reset role;
insert into storage.objects (bucket_id, name, metadata)
select 'documents', storage_path, '{"size": 10}' from public.revisions where id = (select v from ids where k = 'r1');
set local role authenticated;
select public.complete_revision_upload((select v from ids where k = 'r1'), repeat('a', 64));
select public.publish_revision((select v from ids where k = 'r1'));
insert into ids values ('dep', public.create_dependency((select v from ids where k = 'r1'), 'render', 'Render hall', 'rita@render.com', 1));

select lives_ok($$ insert into ids values ('c1', public.add_comment(null, (select v from ids where k = 'dep'),
  'Más luz en la ventana', null, '{"x": 0.123456, "y": 0.5, "color": "rojo"}')) $$, 'Comentario anclado sobre el render');
select is((select anchor from public.comments where id = (select v from ids where k = 'c1')), '{"x": 0.1235, "y": 0.5}'::jsonb,
  'Se guarda solo la posición, redondeada');
select is((select round from public.comments where id = (select v from ids where k = 'c1')), 1, 'Cae en la ronda 1');
select throws_ok($$ select public.add_comment(null, (select v from ids where k = 'dep'), 'Fuera', null, '{"x": 1.5, "y": 0.2}') $$,
  '23514', null, 'Un ancla fuera de la imagen se rechaza');

select set_config('request.jwt.claims', '{"sub":"55555555-5555-5555-5555-555555555555"}', true);
select public.claim_invitations();
select throws_ok($$ select public.close_round((select v from ids where k = 'dep')) $$,
  '42501', null, 'La renderista no cierra rondas');

select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', true);
select is(public.close_round((select v from ids where k = 'dep')), 2, 'La dueña cierra la ronda 1 y abre la 2');
reset role;
select is((select (payload ->> 'comments')::int from public.outbox where kind = 'round_closed'
           and org_id = (select v from ids where k = 'org_a')), 1, 'A la renderista le llega qué corregir');
set local role authenticated;
select throws_ok($$ select public.close_round((select v from ids where k = 'dep')) $$,
  '22023', null, 'Una ronda sin comentarios no se cierra');
select public.add_comment(null, (select v from ids where k = 'dep'), 'Ahora el piso', null, null);
select is((select round from public.comments where body = 'Ahora el piso'), 2, 'El comentario nuevo cae en la ronda 2');
select public.close_round((select v from ids where k = 'dep'));
select ok((select (data ->> 'over_contract')::boolean from public.events where type = 'dependency.round_closed'
           and org_id = (select v from ids where k = 'org_a') order by id desc limit 1),
  'Cerrar la ronda 2 con 1 contratada queda marcado como fuera de contrato');
insert into ids values ('c_pdf', public.add_comment((select v from ids where k = 'r1'), null, 'Cota', 3));
select is((select page from public.comments where id = (select v from ids where k = 'c_pdf')), 3,
  'En un PDF se sigue anclando por página');

select * from finish();
rollback;
