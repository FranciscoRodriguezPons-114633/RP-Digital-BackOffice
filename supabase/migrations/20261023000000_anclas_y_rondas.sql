-- Sprint 5 · Cierre de E8: comentarios anclados y rondas
-- Un comentario sobre una imagen guarda dónde (x, y entre 0 y 1). Las piezas cuentan rondas
-- de correcciones: cada comentario cae en la ronda abierta; el estudio cierra la ronda y le
-- pide los cambios al responsable. Si se usan más rondas que las contratadas, se avisa.

alter table public.comments add column round integer check (round >= 1);
alter table public.comments add constraint comments_anchor_shape check (
  anchor is null or (
    jsonb_typeof(anchor -> 'x') = 'number' and jsonb_typeof(anchor -> 'y') = 'number'
    and (anchor ->> 'x')::numeric between 0 and 1 and (anchor ->> 'y')::numeric between 0 and 1
  )
);

alter table public.dependencies add column current_round integer not null default 1 check (current_round >= 1);

-- Se rehace para aceptar el ancla y anotar la ronda de la pieza.
drop function public.add_comment(uuid, uuid, text, integer);

create or replace function public.add_comment(
  p_revision_id uuid, p_dependency_id uuid, p_body text, p_page integer default null, p_anchor jsonb default null)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_project uuid;
  v_label text;
  v_round integer;
  v_project_name text;
  v_email text := private.current_email();
  v_anchor jsonb;
  v_id uuid;
  v_event bigint;
begin
  if num_nonnulls(p_revision_id, p_dependency_id) <> 1 then
    raise exception 'Elegí un archivo' using errcode = '23514';
  end if;
  if not private.can_see_file(p_revision_id, p_dependency_id) then
    raise exception 'No tenés acceso a este archivo' using errcode = '42501';
  end if;
  -- Del ancla se guardan solo x e y, redondeados.
  if p_anchor is not null then
    v_anchor := jsonb_build_object('x', round((p_anchor ->> 'x')::numeric, 4), 'y', round((p_anchor ->> 'y')::numeric, 4));
  end if;

  if p_revision_id is not null then
    select r.org_id, r.project_id, d.code || ' ' || r.code into v_org, v_project, v_label
    from public.revisions r join public.documents d on d.id = r.document_id where r.id = p_revision_id;
  else
    select x.org_id, x.project_id, x.title, x.current_round into v_org, v_project, v_label, v_round
    from public.dependencies x where x.id = p_dependency_id;
  end if;

  insert into public.comments (org_id, project_id, revision_id, dependency_id, author_id, author_email, body, page,
                               anchor, round)
  values (v_org, v_project, p_revision_id, p_dependency_id, (select auth.uid()), v_email, btrim(p_body), p_page,
          v_anchor, v_round)
  returning id into v_id;

  v_event := private.log_event(v_org, 'comment.created', 'comment', v_id,
    jsonb_build_object('project_id', v_project, 'file', v_label, 'page', p_page, 'round', v_round,
                       'body', left(btrim(p_body), 200)));

  if not private.is_org_member(v_org) then
    select name into v_project_name from public.projects where id = v_project;
    insert into public.outbox (org_id, event_id, kind, to_email, payload)
    select v_org, v_event, 'comment_added', lower(u.email),
           jsonb_build_object('project_name', v_project_name, 'project_id', v_project, 'file', v_label,
                              'page', p_page, 'author_email', v_email, 'body', left(btrim(p_body), 500))
    from public.memberships m join auth.users u on u.id = m.user_id
    where m.org_id = v_org and m.role = 'owner';
  end if;
  return v_id;
end;
$$;

-- Cierra la ronda abierta de una pieza: le avisa al responsable qué hay que corregir y abre
-- la siguiente. Devuelve la ronda nueva.
create or replace function public.close_round(p_dependency_id uuid)
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  v_dep public.dependencies%rowtype;
  v_open integer;
  v_project_name text;
  v_event bigint;
begin
  select * into v_dep from public.dependencies where id = p_dependency_id for update;
  if not found or not private.is_org_member(v_dep.org_id) then
    raise exception 'Solo el estudio cierra rondas' using errcode = '42501';
  end if;
  select count(*) into v_open from public.comments
  where dependency_id = p_dependency_id and round = v_dep.current_round and status = 'open';
  if v_open = 0 then
    raise exception 'La ronda no tiene comentarios para corregir' using errcode = '22023';
  end if;

  update public.dependencies set current_round = current_round + 1 where id = p_dependency_id;

  v_event := private.log_event(v_dep.org_id, 'dependency.round_closed', 'dependency', p_dependency_id,
    jsonb_build_object('project_id', v_dep.project_id, 'title', v_dep.title, 'round', v_dep.current_round,
                       'comments', v_open, 'rounds_contracted', v_dep.rounds_contracted,
                       'over_contract', v_dep.rounds_contracted is not null and v_dep.current_round > v_dep.rounds_contracted));

  if v_dep.responsible_email is not null then
    select name into v_project_name from public.projects where id = v_dep.project_id;
    insert into public.outbox (org_id, event_id, kind, to_email, payload)
    values (v_dep.org_id, v_event, 'round_closed', v_dep.responsible_email,
            jsonb_build_object('project_name', v_project_name, 'project_id', v_dep.project_id, 'title', v_dep.title,
                               'round', v_dep.current_round, 'comments', v_open,
                               'rounds_contracted', v_dep.rounds_contracted));
  end if;
  return v_dep.current_round + 1;
end;
$$;

revoke execute on function public.add_comment(uuid, uuid, text, integer, jsonb) from public, anon;
revoke execute on function public.close_round(uuid) from public, anon;
grant execute on function public.add_comment(uuid, uuid, text, integer, jsonb) to authenticated;
grant execute on function public.close_round(uuid) to authenticated;
