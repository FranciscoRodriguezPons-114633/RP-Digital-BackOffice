-- Sprint 5 · E11: puesta en marcha
-- Para que un estudio nuevo tenga un proyecto real cargado en menos de 30 minutos:
-- copiar etapas y lista de planos de otro proyecto (plantilla) y un proyecto de ejemplo.
-- La carga masiva de planos usa las funciones de documentos y revisiones que ya existen.

-- Copia las etapas (sin horas) y la lista de documentos (sin revisiones) de un proyecto a otro.
create or replace function public.copy_project_setup(p_from uuid, p_to uuid)
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  v_from public.projects%rowtype;
  v_to public.projects%rowtype;
  v_stages integer;
  v_docs integer;
begin
  select * into v_from from public.projects where id = p_from;
  select * into v_to from public.projects where id = p_to;
  if v_from.id is null or v_to.id is null or v_from.org_id <> v_to.org_id or not private.is_org_owner(v_to.org_id) then
    raise exception 'Solo el dueño copia proyectos de su estudio' using errcode = '42501';
  end if;
  if exists (select 1 from public.fee_stages where project_id = p_to)
     or exists (select 1 from public.documents where project_id = p_to) then
    raise exception 'El proyecto nuevo ya tiene etapas o documentos' using errcode = '22023';
  end if;

  insert into public.fee_stages (org_id, project_id, name, position, kind, currency, amount, hourly_rate, budget_hours,
                                 index_name, index_base_period, created_by)
  select v_to.org_id, p_to, s.name, s.position, s.kind, s.currency, s.amount, s.hourly_rate, s.budget_hours,
         s.index_name, s.index_base_period, (select auth.uid())
  from public.fee_stages s where s.project_id = p_from order by s.position;
  get diagnostics v_stages = row_count;

  insert into public.documents (org_id, project_id, code, title, discipline, created_by)
  select v_to.org_id, p_to, d.code, d.title, d.discipline, (select auth.uid())
  from public.documents d where d.project_id = p_from;
  get diagnostics v_docs = row_count;

  perform private.log_event(v_to.org_id, 'project.copied', 'project', p_to,
    jsonb_build_object('project_id', p_to, 'from_project_id', p_from, 'from_name', v_from.name,
                       'stages', v_stages, 'documents', v_docs));
  return v_stages + v_docs;
end;
$$;

-- Proyecto de ejemplo para mostrar el producto con datos: etapas con montos y horas
-- previstas, planos, una orden de cambio en borrador y un vencimiento.
create or replace function public.create_sample_project(p_org_id uuid)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_project uuid;
begin
  if not private.is_org_owner(p_org_id) then
    raise exception 'Solo el dueño crea el proyecto de ejemplo' using errcode = '42501';
  end if;

  insert into public.projects (org_id, name, code, client_name, created_by)
  values (p_org_id, 'Casa Ejemplo (proyecto de prueba)', 'EJ-01', 'Familia Ejemplo', (select auth.uid()))
  returning id into v_project;

  perform public.apply_fee_template(v_project, 'USD');
  update public.fee_stages s
  set amount = t.amount, budget_hours = t.hours
  from (values (1, 3000, 40), (2, 4500, 80), (3, 9000, 200), (4, 12000, 300)) as t (pos, amount, hours)
  where s.project_id = v_project and s.position = t.pos;

  perform public.create_document(v_project, 'A-101', 'Planta baja', 'architecture');
  perform public.create_document(v_project, 'A-102', 'Planta alta', 'architecture');
  perform public.create_document(v_project, 'A-201', 'Fachadas', 'architecture');
  perform public.create_document(v_project, 'E-101', 'Estructura de fundaciones', 'structure');

  perform public.create_change_order(
    (select id from public.fee_stages where project_id = v_project and position = 2),
    'Ampliación del quincho', 'El cliente pidió sumar un quincho con parrilla en el fondo.', 16, 1200, '{A-101}');

  perform public.create_deadline(p_org_id, v_project, 'Presentación del anteproyecto al cliente',
    ((now() at time zone 'America/Argentina/Cordoba')::date + 20), '{7,2}');

  return v_project;
end;
$$;

revoke execute on function public.copy_project_setup(uuid, uuid) from public, anon;
revoke execute on function public.create_sample_project(uuid) from public, anon;
grant execute on function public.copy_project_setup(uuid, uuid) to authenticated;
grant execute on function public.create_sample_project(uuid) to authenticated;
