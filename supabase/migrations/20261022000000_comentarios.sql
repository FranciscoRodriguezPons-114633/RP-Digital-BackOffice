-- Sprint 4 · Inicio de E8: comentarios por archivo
-- Un comentario queda pegado a la versión exacta (una revisión o una pieza, que no cambian),
-- con la página si es un PDF. Comentan el estudio y los invitados que ven ese archivo; se
-- resuelven. El anclaje sobre la imagen (coordenadas) y el contador de rondas llegan en el sprint 5.

create table public.comments (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations (id) on delete cascade,
  project_id     uuid not null references public.projects (id) on delete cascade,
  revision_id    uuid references public.revisions (id) on delete cascade,
  dependency_id  uuid references public.dependencies (id) on delete cascade,
  author_id      uuid not null references auth.users (id),
  author_email   text not null,
  body           text not null check (length(btrim(body)) between 1 and 2000),
  page           integer check (page between 1 and 10000),
  anchor         jsonb,  -- reservado para la posición sobre la imagen o la página
  status         text not null default 'open' check (status in ('open', 'resolved')),
  resolved_by    uuid references auth.users (id),
  resolved_at    timestamptz,
  created_at     timestamptz not null default now(),
  constraint comments_one_target check (num_nonnulls(revision_id, dependency_id) = 1)
);
create index comments_org_id_idx on public.comments (org_id);
create index comments_project_id_idx on public.comments (project_id);
create index comments_revision_idx on public.comments (revision_id);
create index comments_dependency_idx on public.comments (dependency_id);

-- Puede ver (y comentar) un archivo quien es del estudio, a quien se lo enviaron
-- o el responsable de la pieza.
create or replace function private.can_see_file(p_revision_id uuid, p_dependency_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select case
    when p_revision_id is not null then
      exists (select 1 from public.revisions r where r.id = p_revision_id and private.is_org_member(r.org_id))
      or private.was_shipped_to_me(p_revision_id, null)
    else
      private.can_access_dependency(p_dependency_id) or private.was_shipped_to_me(null, p_dependency_id)
  end;
$$;

alter table public.comments enable row level security;
create policy comments_select on public.comments
for select to authenticated using (private.can_see_file(revision_id, dependency_id));

revoke all on public.comments from anon;
revoke insert, update, delete on public.comments from authenticated;

create or replace function public.add_comment(
  p_revision_id uuid, p_dependency_id uuid, p_body text, p_page integer default null)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_project uuid;
  v_label text;
  v_project_name text;
  v_email text := private.current_email();
  v_id uuid;
  v_event bigint;
begin
  if num_nonnulls(p_revision_id, p_dependency_id) <> 1 then
    raise exception 'Elegí un archivo' using errcode = '23514';
  end if;
  if not private.can_see_file(p_revision_id, p_dependency_id) then
    raise exception 'No tenés acceso a este archivo' using errcode = '42501';
  end if;

  if p_revision_id is not null then
    select r.org_id, r.project_id, d.code || ' ' || r.code into v_org, v_project, v_label
    from public.revisions r join public.documents d on d.id = r.document_id where r.id = p_revision_id;
  else
    select x.org_id, x.project_id, x.title into v_org, v_project, v_label
    from public.dependencies x where x.id = p_dependency_id;
  end if;

  insert into public.comments (org_id, project_id, revision_id, dependency_id, author_id, author_email, body, page)
  values (v_org, v_project, p_revision_id, p_dependency_id, (select auth.uid()), v_email, btrim(p_body), p_page)
  returning id into v_id;

  v_event := private.log_event(v_org, 'comment.created', 'comment', v_id,
    jsonb_build_object('project_id', v_project, 'file', v_label, 'page', p_page, 'body', left(btrim(p_body), 200)));

  -- Si comenta un invitado, se avisa a los dueños del estudio.
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

-- Resuelve el estudio o quien lo escribió.
create or replace function public.resolve_comment(p_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_c public.comments%rowtype;
begin
  select * into v_c from public.comments where id = p_id for update;
  if not found or not (private.is_org_member(v_c.org_id) or v_c.author_id = (select auth.uid())) then
    raise exception 'No podés resolver este comentario' using errcode = '42501';
  end if;
  if v_c.status = 'resolved' then
    return;
  end if;
  update public.comments set status = 'resolved', resolved_by = (select auth.uid()), resolved_at = now() where id = p_id;
  perform private.log_event(v_c.org_id, 'comment.resolved', 'comment', p_id,
    jsonb_build_object('project_id', v_c.project_id, 'body', left(v_c.body, 200)));
end;
$$;

revoke execute on function public.add_comment(uuid, uuid, text, integer) from public, anon;
revoke execute on function public.resolve_comment(uuid) from public, anon;
grant execute on function public.add_comment(uuid, uuid, text, integer) to authenticated;
grant execute on function public.resolve_comment(uuid) to authenticated;

revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;
