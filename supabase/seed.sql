-- Datos de prueba para desarrollo local. Solo se cargan con `supabase start` o
-- `supabase db reset`; `supabase db push` (la nube) no los aplica.
-- Contraseña de los tres usuarios: dev-password-local (ver DEV_PASSWORD en src/lib/env.ts).

-- ---------- Usuarios con contraseña (para el ingreso rápido de desarrollo) ----------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select
  '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
  extensions.crypt('dev-password-local', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
  '', '', '', ''
from (values
  ('a0000000-0000-4000-8000-000000000001'::uuid, 'ana@estudio.test'),
  ('a0000000-0000-4000-8000-000000000002'::uuid, 'beto@estudio.test'),
  ('a0000000-0000-4000-8000-000000000003'::uuid, 'cliente@estudio.test')
) as u (id, email);

insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text, 'email',
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       now(), now(), now()
from auth.users u
where u.email like '%@estudio.test';

-- ---------- Estudio de ejemplo, creado por Ana con las mismas funciones que usa la app ----------
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000001"}', false);

do $$
declare
  v_ana constant uuid := 'a0000000-0000-4000-8000-000000000001';
  v_org uuid;
  v_alba uuid;
  v_norte uuid;
  v_token text;
begin
  v_org := public.create_organization('Estudio Demo');

  insert into public.projects (org_id, name, code, client_name, created_by)
  values (v_org, 'Edificio Alba', 'EA-01', 'Desarrollos del Centro', v_ana)
  returning id into v_alba;

  insert into public.projects (org_id, name, code, client_name, created_by)
  values (v_org, 'Casa Norte', 'CN-02', 'Familia Pérez', v_ana)
  returning id into v_norte;

  -- Índice de ejemplo para probar el ajuste. Son valores inventados, no los publicados.
  insert into public.price_indices (org_id, name, period, value, created_by)
  select v_org, 'ICC Córdoba', make_date(2026, m, 1), v, v_ana
  from (values (1, 100.0), (2, 102.1), (3, 104.3), (4, 106.5), (5, 108.2),
               (6, 110.0), (7, 112.34), (8, 114.1), (9, 115.9)) as t (m, v);

  -- Casa Norte en pesos, ajustada por el índice desde abril.
  perform public.apply_fee_template(v_norte, 'ARS');
  update public.fee_stages set amount = t.amount, index_name = 'ICC Córdoba', index_base_period = '2026-04-01'
  from (values (1, 1800000), (2, 2700000), (3, 6300000), (4, 9000000)) as t (pos, amount)
  where project_id = v_norte and position = t.pos;

  -- Honorarios de Edificio Alba con la plantilla y montos de ejemplo.
  perform public.apply_fee_template(v_alba, 'USD');
  update public.fee_stages set amount = 4800, budget_hours = 60
  where project_id = v_alba and position = 1;
  update public.fee_stages set amount = 7200, budget_hours = 90
  where project_id = v_alba and position = 2;
  update public.fee_stages set kind = 'mixed', amount = 16800, hourly_rate = 45, budget_hours = 380
  where project_id = v_alba and position = 3;
  update public.fee_stages set amount = 24000, budget_hours = 640
  where project_id = v_alba and position = 4;

  -- Horas de Ana en las últimas dos semanas.
  insert into public.time_entries (stage_id, user_id, work_date, hours, note)
  select s.id, v_ana, current_date - h.days_ago, h.hours, h.note
  from public.fee_stages s
  join (values
    (1, 13, 8.0, 'Relevamiento del terreno'),
    (1, 12, 8.0, 'Croquis de implantación'),
    (1, 11, 6.5, 'Croquis de plantas'),
    (1, 10, 8.0, 'Reunión con el cliente y ajustes'),
    (1, 9, 7.5, 'Volumetría'),
    (1, 6, 6.0, 'Ajustes de fachada'),
    (2, 5, 8.0, 'Plantas de anteproyecto'),
    (2, 4, 7.0, 'Cortes y vistas'),
    (2, 3, 4.5, 'Revisión con estructuras'),
    (2, 2, 6.0, 'Memoria descriptiva'),
    (3, 1, 3.0, 'Arranque de documentación')
  ) as h (pos, days_ago, hours, note) on h.pos = s.position
  where s.project_id = v_alba;

  -- Órdenes de cambio en Edificio Alba: OC-001 esperando al cliente, OC-002 aprobada, OC-003 en borrador.
  perform public.create_change_order(
    (select id from public.fee_stages where project_id = v_alba and position = 3),
    'Carpinterías de PVC en fachada norte',
    'Cambio de aluminio a PVC en los pisos 2 a 6. Incluye rehacer detalles y planilla de aberturas.',
    40, 1800, array['A-301', 'A-302']);
  perform public.create_change_order(
    (select id from public.fee_stages where project_id = v_alba and position = 2),
    'Revestimiento del hall de acceso',
    null, 8, 600, array['A-501']);
  perform public.create_change_order(
    (select id from public.fee_stages where project_id = v_alba and position = 1),
    'Cambio de solado en terrazas',
    null, 10, 750, array['A-401', 'A-402']);

  -- OC-001 enviada con un link fijo, para probar la página del cliente en local:
  -- http://localhost:3000/aprobar/link-de-prueba-local-para-aprobar-la-oc-001
  perform public.send_change_order(
    (select id from public.change_orders where project_id = v_alba and number = 1), 'cliente@estudio.test');
  update public.approval_links
  set token_hash = encode(extensions.digest('link-de-prueba-local-para-aprobar-la-oc-001', 'sha256'), 'hex')
  where change_order_id = (select id from public.change_orders where project_id = v_alba and number = 1);
  update public.outbox set payload = jsonb_set(payload, '{token}', '"link-de-prueba-local-para-aprobar-la-oc-001"')
  where kind = 'change_order_sent';

  -- OC-002 enviada y aprobada por el cliente desde el link (sin sesión).
  select token into v_token from public.send_change_order(
    (select id from public.change_orders where project_id = v_alba and number = 2), 'cliente@estudio.test');
  perform set_config('request.jwt.claims', '{"role":"anon"}', false);
  perform public.decide_change_order(v_token, 'approved', 'Laura Gómez', 'Dale, avancen.', null, 'seed');
  perform set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000001"}', false);

  -- El cliente ya está registrado, así que queda vinculado al proyecto en el acto.
  perform public.invite_guest(v_alba, 'cliente@estudio.test', 'client');
  -- Beto entra como miembro la primera vez que inicia sesión (claim_invitations).
  perform public.invite_member(v_org, 'beto@estudio.test', 'member');
end;
$$;

select set_config('request.jwt.claims', '', false);

-- En local, Ana además administra la plataforma (panel /admin/cobros).
insert into public.platform_admins (user_id) values ('a0000000-0000-4000-8000-000000000001');

-- Los correos de estas invitaciones no hacen falta en local.
update public.outbox set status = 'sent', sent_at = now() where to_email like '%@estudio.test';
