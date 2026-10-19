-- Sprint 5 · Prueba de 30 días y pase a pago con cobro manual.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'ana@estudio-a.com'),     -- dueña A
  ('22222222-2222-2222-2222-222222222222', 'beto@estudio-a.com'),    -- miembro A
  ('99999999-9999-9999-9999-999999999999', 'admin@plataforma.com');  -- administra la plataforma
insert into public.platform_admins (user_id) values ('99999999-9999-9999-9999-999999999999');

create temp table ids (k text primary key, v uuid);
grant select, insert, update on ids to public;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', true);
insert into ids values ('org_a', public.create_organization('Estudio A'));
select public.invite_member((select v from ids where k = 'org_a'), 'beto@estudio-a.com', 'member');

select is((select plan from public.org_plan_status((select v from ids where k = 'org_a'))), 'trial', 'Un estudio nuevo arranca en prueba');
select ok((select trial_ends_at between now() + interval '29 days' and now() + interval '31 days'
           from public.org_plan_status((select v from ids where k = 'org_a'))), 'Con 30 días de prueba');
select throws_ok($$ update public.organizations set plan = 'pro' where id = (select v from ids where k = 'org_a') $$,
  '42501', null, 'La dueña no se cambia el plan sola');
select throws_ok($$ select public.request_paid_plan((select v from ids where k = 'org_a'), 'estudio', 'monthly',
  'Estudio A SRL', '123', 'pagos@estudio-a.com') $$, '23514', null, 'El CUIT tiene que ser válido');
select lives_ok($$ insert into ids values ('req', public.request_paid_plan((select v from ids where k = 'org_a'), 'estudio',
  'monthly', 'Estudio A SRL', '30-71234567-9', 'Pagos@Estudio-A.com')) $$, 'La dueña pide pasar al plan Estudio');
select throws_ok($$ select public.request_paid_plan((select v from ids where k = 'org_a'), 'pro', 'monthly',
  'Estudio A SRL', '30712345679', 'pagos@estudio-a.com') $$, '23505', null, 'Un solo pedido pendiente a la vez');
select throws_ok($$ select public.decide_billing_request((select v from ids where k = 'req'), true, current_date + 30) $$,
  '42501', null, 'La dueña no se aprueba el pago sola');
reset role;
select ok(exists (select 1 from public.outbox where kind = 'billing_requested'
  and org_id = (select v from ids where k = 'org_a') and to_email = 'admin@plataforma.com'),
  'Le avisamos a la administración de la plataforma');
set local role authenticated;

select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222"}', true);
select public.claim_invitations();
select throws_ok($$ select public.request_paid_plan((select v from ids where k = 'org_a'), 'pro', 'monthly',
  'X', '30712345679', 'x@x.com') $$, '42501', null, 'Un miembro no pide el pase a pago');
select is((select count(*)::int from public.billing_requests), 0, 'Ni ve los datos de facturación');

select set_config('request.jwt.claims', '{"sub":"99999999-9999-9999-9999-999999999999"}', true);
select is((select count(*)::int from public.list_billing_requests() where status = 'pending'), 1, 'La plataforma ve el pedido');
select throws_ok($$ select public.decide_billing_request((select v from ids where k = 'req'), true, null) $$,
  '23514', null, 'Para aprobar hay que decir hasta cuándo está pago');
select lives_ok($$ select public.decide_billing_request((select v from ids where k = 'req'), true,
  ((now() at time zone 'America/Argentina/Cordoba')::date + 30), 'Transferencia recibida') $$, 'Confirma el pago');

select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', true);
select is((select plan from public.org_plan_status((select v from ids where k = 'org_a'))), 'estudio',
  'El estudio pasa al plan sin que nadie toque la base');

select * from finish();
rollback;
