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

-- Series de referencia de ejemplo: CAC general (enero a agosto) y escala UOCRA (septiembre y
-- octubre). Son valores inventados, no los publicados: en la nube los carga la plataforma desde
-- /admin/series.
insert into public.reference_values (series_code, period, value, loaded_by)
select 'cac_general', make_date(2026, m, 1), v, 'a0000000-0000-4000-8000-000000000001'
from (values (1, 14120.5), (2, 14498.2), (3, 14870.9), (4, 15215.3), (5, 15540.8),
             (6, 15902.1), (7, 16288.4), (8, 16655.0)) as t (m, v);
insert into public.reference_values (series_code, period, value, provisional, loaded_by)
select code, make_date(2026, m, 1), v, true, 'a0000000-0000-4000-8000-000000000001'
from (values ('uocra_ayudante', 9, 3350.0), ('uocra_ayudante', 10, 3520.0),
             ('uocra_medio_oficial', 9, 3640.0), ('uocra_medio_oficial', 10, 3820.0),
             ('uocra_oficial', 9, 3950.0), ('uocra_oficial', 10, 4150.0),
             ('uocra_oficial_especializado', 9, 4630.0), ('uocra_oficial_especializado', 10, 4860.0)) as t (code, m, v);

-- Catálogo de análisis de precios de ejemplo. Los rendimientos son ilustrativos, sin validar:
-- en la nube el catálogo lo carga la plataforma cuando esté curado.
insert into public.catalog_unit_analyses (code, name, unit, chapter, default_waste_pct, note, position) values
  ('MAM-H18', 'Mampostería de ladrillo hueco 18 cm', 'm2', 'Mampostería', 5, 'Ejemplo sin validar', 10),
  ('MAM-H12', 'Mampostería de ladrillo hueco 12 cm', 'm2', 'Mampostería', 5, 'Ejemplo sin validar', 20),
  ('REV-GRUESO', 'Revoque grueso a la cal', 'm2', 'Revoques', 8, 'Ejemplo sin validar', 30),
  ('CONTRAPISO-8', 'Contrapiso de hormigón pobre de 8 cm', 'm2', 'Contrapisos y carpetas', 5, 'Ejemplo sin validar', 40);
insert into public.catalog_components (analysis_code, supply_code, supply_name, supply_kind, supply_unit, yield, waste_pct, position) values
  ('MAM-H18', 'LAD-H18', 'Ladrillo hueco 18x18x33', 'material', 'u', 15.5, 5, 1),
  ('MAM-H18', 'CEM-PORT', 'Cemento Portland', 'material', 'kg', 4.2, 5, 2),
  ('MAM-H18', 'CAL-HID', 'Cal hidráulica', 'material', 'kg', 5.5, 5, 3),
  ('MAM-H18', 'ARENA', 'Arena fina', 'material', 'm3', 0.03, 10, 4),
  ('MAM-H18', 'MO-OFICIAL', 'Oficial albañil', 'labor', 'h', 0.8, 0, 5),
  ('MAM-H18', 'MO-AYUDANTE', 'Ayudante', 'labor', 'h', 0.6, 0, 6),
  ('MAM-H12', 'LAD-H12', 'Ladrillo hueco 12x18x33', 'material', 'u', 15.5, 5, 1),
  ('MAM-H12', 'CEM-PORT', 'Cemento Portland', 'material', 'kg', 3.1, 5, 2),
  ('MAM-H12', 'CAL-HID', 'Cal hidráulica', 'material', 'kg', 4.0, 5, 3),
  ('MAM-H12', 'ARENA', 'Arena fina', 'material', 'm3', 0.022, 10, 4),
  ('MAM-H12', 'MO-OFICIAL', 'Oficial albañil', 'labor', 'h', 0.7, 0, 5),
  ('MAM-H12', 'MO-AYUDANTE', 'Ayudante', 'labor', 'h', 0.5, 0, 6),
  ('REV-GRUESO', 'CEM-PORT', 'Cemento Portland', 'material', 'kg', 2.0, 8, 1),
  ('REV-GRUESO', 'CAL-HID', 'Cal hidráulica', 'material', 'kg', 4.5, 8, 2),
  ('REV-GRUESO', 'ARENA', 'Arena fina', 'material', 'm3', 0.025, 10, 3),
  ('REV-GRUESO', 'MO-OFICIAL', 'Oficial albañil', 'labor', 'h', 0.55, 0, 4),
  ('REV-GRUESO', 'MO-AYUDANTE', 'Ayudante', 'labor', 'h', 0.3, 0, 5),
  ('CONTRAPISO-8', 'CEM-PORT', 'Cemento Portland', 'material', 'kg', 9.0, 5, 1),
  ('CONTRAPISO-8', 'ARENA', 'Arena fina', 'material', 'm3', 0.04, 10, 2),
  ('CONTRAPISO-8', 'CASCOTE', 'Cascote de ladrillo', 'material', 'm3', 0.07, 10, 3),
  ('CONTRAPISO-8', 'MO-OFICIAL', 'Oficial albañil', 'labor', 'h', 0.35, 0, 4),
  ('CONTRAPISO-8', 'MO-AYUDANTE', 'Ayudante', 'labor', 'h', 0.5, 0, 5),
  ('CONTRAPISO-8', 'EQ-HORMIGONERA', 'Hormigonera 130 l', 'equipment', 'día', 0.01, 0, 6);

-- ---------- Estudio de ejemplo, creado por Ana con las mismas funciones que usa la app ----------
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000001"}', false);

do $$
declare
  v_ana constant uuid := 'a0000000-0000-4000-8000-000000000001';
  v_client uuid;
  v_supplier uuid;
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

  -- Finanzas de obra en prueba para el estudio de ejemplo (en la nube lo habilita la plataforma).
  update public.organizations set beta_features = '{works}' where id = v_org;
  -- El comitente de Edificio Alba, registrado como tercero (CUIT de ejemplo con dígito verificador válido).
  insert into public.parties (org_id, name, tax_id, roles, vat_condition, gross_income_condition, created_by)
  values (v_org, 'Desarrollos del Centro', '30500000003', '{client}', 'registered', 'local', v_ana)
  returning id into v_client;
  -- Ficha de obra de Edificio Alba: el estudio dirige la obra que construye otro.
  perform public.upsert_work(v_alba, 'works_director', 'Av. Hipólito Yrigoyen 450', 'Córdoba',
                             2400, 180, 'multifamily', 'standard', '2027-03-01', '2028-09-30', 'USD', v_client);
  -- Biblioteca de insumos de ejemplo (precios inventados): un proveedor, el coeficiente de cargas
  -- y cuatro insumos; el oficial toma el precio de la escala UOCRA × (1 + cargas).
  insert into public.parties (org_id, name, tax_id, roles, vat_condition, created_by)
  values (v_org, 'Corralón del Centro', '30712345671', '{supplier}', 'registered', v_ana)
  returning id into v_supplier;
  insert into public.labor_settings (org_id, valid_from, charges_pct, created_by)
  values (v_org, '2026-01-01', 62.5, v_ana);
  -- Los códigos coinciden con los del catálogo de ejemplo: al importar un análisis se emparejan.
  perform public.upsert_supply(v_org, null, 'material', 'CEM-PORT', 'Cemento Portland', 'kg', 'ARS',
                               190, '2026-11-02', v_supplier);
  perform public.upsert_supply(v_org, null, 'material', 'HIE-ADN12', 'Hierro ADN 420 ø 12 mm', 'kg', 'USD',
                               1.35, '2026-11-02', v_supplier);
  perform public.upsert_supply(v_org, null, 'equipment', 'EQ-HORMIGONERA', 'Hormigonera 130 l', 'día', 'ARS',
                               18000, '2026-11-02');
  perform public.upsert_supply(v_org, null, 'labor', 'MO-OFICIAL', 'Oficial albañil', 'h', 'ARS',
                               null, null, null, 'uocra_oficial');
  -- Costo por hora de Ana (inventado), para ver la rentabilidad. Beto no tiene: la app avisa que falta.
  insert into public.member_costs (org_id, user_id, hourly_cost, currency, valid_from, created_by)
  values (v_org, v_ana, 25, 'USD', '2026-01-01', v_ana);
end;
$$;

select set_config('request.jwt.claims', '', false);

-- En local, Ana además administra la plataforma (panel /admin/cobros).
insert into public.platform_admins (user_id) values ('a0000000-0000-4000-8000-000000000001');

-- Los correos de estas invitaciones no hacen falta en local.
update public.outbox set status = 'sent', sent_at = now() where to_email like '%@estudio.test';
