-- Sprint 4 · Registro de envíos.
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'ana@estudio-a.com'),     -- dueña A
  ('33333333-3333-3333-3333-333333333333', 'bruno@estudio-b.com'),   -- dueño B
  ('44444444-4444-4444-4444-444444444444', 'cliente@gmail.com'),     -- cliente de A
  ('66666666-6666-6666-6666-666666666666', 'mario@gmail.com');       -- registrado, sin invitación

create temp table ids (k text primary key, v uuid);
grant select, insert, update on ids to public;

create function pg_temp.upload(p_doc uuid, p_code text) returns uuid language plpgsql as $$
declare v_id uuid; v_path text;
begin
  select id, storage_path into v_id, v_path from public.create_revision(p_doc, p_code, p_code || '.pdf', 10, 'application/pdf');
  insert into storage.objects (bucket_id, name, metadata) values ('documents', v_path, '{"size": 10}');
  perform public.complete_revision_upload(v_id, repeat(lower(left(p_code, 1)), 64));
  return v_id;
end $$;
grant execute on function pg_temp.upload(uuid, text) to public;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', true);
insert into ids values ('org_a', public.create_organization('Estudio A'));
with x as (
  insert into public.projects (org_id, name, created_by)
  select v, 'Edificio Alba', '11111111-1111-1111-1111-111111111111' from ids where k = 'org_a'
  returning id)
insert into ids select 'p1', id from x;
select public.invite_guest((select v from ids where k = 'p1'), 'cliente@gmail.com', 'client');
insert into ids values ('d1', public.create_document((select v from ids where k = 'p1'), 'A-101', 'Planta baja'));
insert into ids values ('r1', pg_temp.upload((select v from ids where k = 'd1'), 'C01'));
select public.publish_revision((select v from ids where k = 'r1'));
insert into ids values ('r2', pg_temp.upload((select v from ids where k = 'd1'), 'D02'));   -- borrador con archivo
insert into ids select 'r3', id from public.create_revision((select v from ids where k = 'd1'), 'C03', 'x.pdf', 10, 'application/pdf');
insert into ids values ('dep1', public.create_dependency((select v from ids where k = 'r1'), 'render', 'Render hall'));
select public.attach_dependency_file((select v from ids where k = 'dep1'), 'hall.jpg', 10, 'image/jpeg');
reset role;
insert into storage.objects (bucket_id, name, metadata)
select 'documents', storage_path, '{"size": 10}' from public.dependencies where id = (select v from ids where k = 'dep1');
set local role authenticated;
select public.complete_dependency_upload((select v from ids where k = 'dep1'), repeat('e', 64));

-- ---------- Enviar ----------
select throws_ok($$ select public.send_shipment((select v from ids where k = 'p1'), 'mario@gmail.com',
  array[(select v from ids where k = 'r1')]) $$, '23514', null, 'Solo se envía a invitados del proyecto');
select throws_ok($$ select public.send_shipment((select v from ids where k = 'p1'), 'cliente@gmail.com') $$,
  '23514', null, 'Hace falta al menos un archivo');
select throws_ok($$ select public.send_shipment((select v from ids where k = 'p1'), 'cliente@gmail.com',
  array[(select v from ids where k = 'r3')]) $$, '22023', null, 'No se envía una revisión sin archivo');
select lives_ok($$ insert into ids values ('s1', public.send_shipment((select v from ids where k = 'p1'), ' Cliente@Gmail.com ',
  array[(select v from ids where k = 'r1'), (select v from ids where k = 'r2'), (select v from ids where k = 'r1')],
  array[(select v from ids where k = 'dep1')], 'email', 'Para la reunión del jueves')) $$,
  'La dueña envía dos revisiones y un render al cliente');
select is((select count(*)::int from public.shipment_items where shipment_id = (select v from ids where k = 's1')), 3,
  'Tres archivos, sin repetir');
select is((select sha256 from public.shipment_items where revision_id = (select v from ids where k = 'r1')),
  (select sha256 from public.revisions where id = (select v from ids where k = 'r1')),
  'Cada ítem guarda la huella del archivo enviado');
select is((select label from public.shipment_items where revision_id = (select v from ids where k = 'r1')),
  'A-101 C01 · Planta baja', 'Y cómo se llamaba al enviarlo');
select is((select status from public.revisions where id = (select v from ids where k = 'r2')), 'shared',
  'El borrador enviado pasa a compartido');
select throws_ok($$ insert into public.shipments (org_id, project_id, recipient_email, created_by)
  select v, (select v from ids where k = 'p1'), 'cliente@gmail.com', '11111111-1111-1111-1111-111111111111' from ids where k = 'org_a' $$,
  '42501', null, 'No se registran envíos salteando la función');
reset role;
select is((select jsonb_array_length(payload -> 'labels') from public.outbox where kind = 'shipment_sent'
           and org_id = (select v from ids where k = 'org_a')), 3, 'Al cliente le llega un correo con lo enviado');
set local role authenticated;

-- ---------- Lo que ve el cliente ----------
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444"}', true);
select is((select count(*)::int from public.shipment_items), 3, 'El cliente ve sus ítems enviados');
select is((select count(*)::int from public.revisions), 2, 'Ve las dos revisiones que le mandaron, no la que no');
select is((select count(*)::int from public.dependencies), 1, 'Ve el render que le mandaron');
select is((select count(*)::int from storage.objects where bucket_id = 'documents'), 3, 'Y puede descargar esos tres archivos');

select public.record_file_open((select v from ids where k = 'r1'));
select public.record_file_open((select v from ids where k = 'r1'));
select is((select open_count from public.shipment_items where revision_id = (select v from ids where k = 'r1')), 2,
  'Cada apertura queda contada');
select ok((select first_opened_at <= last_opened_at from public.shipment_items where revision_id = (select v from ids where k = 'r1')),
  'Se guarda la primera y la última vez que lo abrió');

select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', true);
select public.record_file_open((select v from ids where k = 'r1'));
select is((select open_count from public.shipment_items where revision_id = (select v from ids where k = 'r1')), 2,
  'Si lo abre el estudio no cuenta como apertura del cliente');
select public.publish_revision((select v from ids where k = 'r2'));

select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444"}', true);
select is((select status from public.revisions where id = (select v from ids where k = 'r1')), 'superseded',
  'El cliente ve que la C01 que le mandaron ya no es la vigente');

-- ---------- Aislamiento ----------
select set_config('request.jwt.claims', '{"sub":"66666666-6666-6666-6666-666666666666"}', true);
select is((select count(*)::int from public.shipments) + (select count(*)::int from public.revisions), 0,
  'Alguien sin invitación no ve envíos ni revisiones');
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333"}', true);
select is((select count(*)::int from public.shipments) + (select count(*)::int from public.shipment_items), 0,
  'Otro estudio no ve envíos');
select throws_ok($$ select public.send_shipment((select v from ids where k = 'p1'), 'cliente@gmail.com',
  array[(select v from ids where k = 'r1')]) $$, '42501', null, 'Ni envía archivos ajenos');

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select count(*) from public.shipments $$, '42501', null, 'Sin sesión no se leen envíos');

select * from finish();
rollback;
