-- Sprint 4 · Cierre de E6: piezas dependientes y bandeja "a revisar"
-- Un render, plano de venta o brochure se hace sobre una revisión publicada. Cuando esa
-- revisión queda reemplazada, la pieza pasa a "a revisar" y su responsable recibe aviso;
-- alguien decide si sigue sirviendo (revalidada) o no (obsoleta).

create table public.dependencies (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations (id) on delete cascade,
  project_id          uuid not null references public.projects (id) on delete cascade,
  source_revision_id  uuid not null references public.revisions (id) on delete restrict,
  kind                text not null check (kind in ('render', 'sales_plan', 'brochure', 'other')),
  title               text not null check (length(btrim(title)) between 2 and 160),
  status              text not null default 'current'
                      check (status in ('current', 'to_review', 'obsolete', 'revalidated')),
  responsible_email   text check (responsible_email = lower(btrim(responsible_email)) and position('@' in responsible_email) > 1),
  rounds_contracted   integer check (rounds_contracted between 0 and 50),
  file_name           text check (length(file_name) between 1 and 200),
  file_size           bigint check (file_size > 0 and file_size <= 52428800),
  mime_type           text check (mime_type in ('application/pdf', 'image/png', 'image/jpeg', 'image/webp')),
  storage_path        text unique,
  sha256              text check (sha256 ~ '^[0-9a-f]{64}$'),
  uploaded_at         timestamptz,
  status_changed_at   timestamptz,
  status_changed_by   uuid references auth.users (id),
  created_by          uuid not null references auth.users (id),
  created_at          timestamptz not null default now()
);
create index dependencies_org_id_idx on public.dependencies (org_id);
create index dependencies_project_id_idx on public.dependencies (project_id);
create index dependencies_source_revision_idx on public.dependencies (source_revision_id);
create index dependencies_responsible_idx on public.dependencies (responsible_email);
create index dependencies_to_review_idx on public.dependencies (org_id) where status = 'to_review';

-- ---------------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------------
-- Ven la pieza los miembros del estudio y su responsable (por ejemplo, el renderista invitado).
create or replace function private.can_access_dependency(p_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.dependencies d
    where d.id = p_id
      and (private.is_org_member(d.org_id) or d.responsible_email = private.current_email())
  );
$$;

-- Storage: se sube al lugar exacto de una revisión o pieza sin archivo; se lee lo que se puede ver.
create or replace function private.can_upload_file(p_name text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select private.can_upload_revision_file(p_name)
      or exists (
        select 1 from public.dependencies d
        where d.storage_path = p_name and d.uploaded_at is null and private.can_access_dependency(d.id)
      );
$$;

create or replace function private.can_read_file(p_name text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select private.can_read_revision_file(p_name)
      or exists (
        select 1 from public.dependencies d
        where d.storage_path = p_name and private.can_access_dependency(d.id)
      );
$$;

drop policy documents_insert_revision_file on storage.objects;
drop policy documents_read_revision_file on storage.objects;
create policy documents_insert_file on storage.objects
for insert to authenticated
with check (bucket_id = 'documents' and private.can_upload_file(name));
create policy documents_read_file on storage.objects
for select to authenticated
using (bucket_id = 'documents' and private.can_read_file(name));

alter table public.dependencies enable row level security;
create policy dependencies_select on public.dependencies
for select to authenticated
using ((select private.is_org_member(org_id)) or responsible_email = (select private.current_email()));

revoke all on public.dependencies from anon;
revoke insert, update, delete on public.dependencies from authenticated;

-- ---------------------------------------------------------------------------
-- RPC
-- ---------------------------------------------------------------------------
create or replace function public.create_dependency(
  p_source_revision_id uuid, p_kind text, p_title text, p_responsible_email text default null,
  p_rounds_contracted integer default null)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_rev public.revisions%rowtype;
  v_doc public.documents%rowtype;
  v_id uuid;
  v_email text := nullif(lower(btrim(coalesce(p_responsible_email, ''))), '');
begin
  select * into v_rev from public.revisions where id = p_source_revision_id;
  if not found or not private.is_org_member(v_rev.org_id) then
    raise exception 'No tenés acceso a esta revisión' using errcode = '42501';
  end if;
  if v_rev.status <> 'published' then
    raise exception 'Una pieza se hace sobre la revisión vigente' using errcode = '22023';
  end if;
  select * into v_doc from public.documents where id = v_rev.document_id;

  insert into public.dependencies (org_id, project_id, source_revision_id, kind, title, responsible_email,
                                   rounds_contracted, created_by)
  values (v_rev.org_id, v_rev.project_id, v_rev.id, p_kind, btrim(p_title), v_email, p_rounds_contracted,
          (select auth.uid()))
  returning id into v_id;

  perform private.log_event(v_rev.org_id, 'dependency.created', 'dependency', v_id,
    jsonb_build_object('project_id', v_rev.project_id, 'title', btrim(p_title), 'kind', p_kind,
                       'document_code', v_doc.code, 'revision_code', v_rev.code, 'responsible_email', v_email));
  return v_id;
end;
$$;

-- Prepara la subida del archivo de la pieza: {org}/{proyecto}/piezas/{pieza}/{archivo}.
-- La pueden subir el estudio o el responsable (el renderista entrega acá su render).
create or replace function public.attach_dependency_file(
  p_id uuid, p_file_name text, p_file_size bigint, p_mime_type text)
returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  v_dep public.dependencies%rowtype;
  v_safe_name text;
  v_path text;
begin
  select * into v_dep from public.dependencies where id = p_id for update;
  if not found or not private.can_access_dependency(p_id) then
    raise exception 'No tenés acceso a esta pieza' using errcode = '42501';
  end if;
  if v_dep.uploaded_at is not null then
    raise exception 'La pieza ya tiene su archivo: para otra versión, creá una pieza nueva' using errcode = '22023';
  end if;

  v_safe_name := left(regexp_replace(btrim(coalesce(p_file_name, '')), '[^A-Za-z0-9._-]+', '-', 'g'), 120);
  if v_safe_name = '' or v_safe_name ~ '^[.-]*$' then
    v_safe_name := 'archivo';
  end if;
  v_path := v_dep.org_id || '/' || v_dep.project_id || '/piezas/' || v_dep.id || '/' || v_safe_name;

  update public.dependencies
  set file_name = left(btrim(p_file_name), 200), file_size = p_file_size, mime_type = p_mime_type,
      storage_path = v_path
  where id = p_id;
  return v_path;
end;
$$;

create or replace function public.complete_dependency_upload(p_id uuid, p_sha256 text)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_dep public.dependencies%rowtype;
  v_size bigint;
begin
  select * into v_dep from public.dependencies where id = p_id for update;
  if not found or not private.can_access_dependency(p_id) then
    raise exception 'No tenés acceso a esta pieza' using errcode = '42501';
  end if;
  if v_dep.uploaded_at is not null then
    return;
  end if;
  if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Huella inválida' using errcode = '23514';
  end if;
  select (o.metadata ->> 'size')::bigint into v_size
  from storage.objects o where o.bucket_id = 'documents' and o.name = v_dep.storage_path;
  if not found then
    raise exception 'El archivo no llegó a subirse' using errcode = '22023';
  end if;

  update public.dependencies
  set sha256 = p_sha256, uploaded_at = now(), file_size = coalesce(v_size, file_size)
  where id = p_id;

  perform private.log_event(v_dep.org_id, 'dependency.uploaded', 'dependency', p_id,
    jsonb_build_object('project_id', v_dep.project_id, 'title', v_dep.title, 'file_name', v_dep.file_name,
                       'sha256', p_sha256));
end;
$$;

-- Decide sobre una pieza "a revisar": revalidada (sigue sirviendo y pasa a depender de la
-- revisión vigente) u obsoleta (no sirve más).
create or replace function public.review_dependency(p_id uuid, p_decision text)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_dep public.dependencies%rowtype;
  v_old public.revisions%rowtype;
  v_current uuid;
  v_current_code text;
begin
  if p_decision is null or p_decision not in ('revalidated', 'obsolete') then
    raise exception 'Decisión inválida' using errcode = '23514';
  end if;
  select * into v_dep from public.dependencies where id = p_id for update;
  if not found or not private.is_org_member(v_dep.org_id) then
    raise exception 'Solo el estudio decide sobre una pieza' using errcode = '42501';
  end if;
  if v_dep.status <> 'to_review' then
    raise exception 'La pieza no está a revisar' using errcode = '22023';
  end if;

  select * into v_old from public.revisions where id = v_dep.source_revision_id;
  select r.id, r.code into v_current, v_current_code from public.revisions r
  where r.document_id = v_old.document_id and r.status = 'published';

  update public.dependencies
  set status = p_decision, status_changed_at = now(), status_changed_by = (select auth.uid()),
      source_revision_id = case when p_decision = 'revalidated' and v_current is not null
                                then v_current else source_revision_id end
  where id = p_id;

  perform private.log_event(v_dep.org_id, 'dependency.' || p_decision, 'dependency', p_id,
    jsonb_build_object('project_id', v_dep.project_id, 'title', v_dep.title,
                       'from_revision_code', v_old.code, 'to_revision_code', v_current_code));
end;
$$;

-- Publicar ahora también marca "a revisar" las piezas hechas sobre la revisión reemplazada,
-- en la misma transacción, con un evento y un aviso por pieza.
create or replace function public.publish_revision(p_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_rev public.revisions%rowtype;
  v_doc public.documents%rowtype;
  v_prev public.revisions%rowtype;
  v_project_name text;
  v_dep public.dependencies%rowtype;
  v_event bigint;
  v_affected integer := 0;
begin
  select * into v_rev from public.revisions where id = p_id;
  if not found or not private.is_org_member(v_rev.org_id) then
    raise exception 'No tenés acceso a esta revisión' using errcode = '42501';
  end if;
  select * into v_doc from public.documents where id = v_rev.document_id for update;
  select * into v_rev from public.revisions where id = p_id for update;

  if v_rev.status not in ('draft', 'shared') then
    raise exception 'Una revisión % no se puede publicar', v_rev.status using errcode = '22023';
  end if;
  if v_rev.uploaded_at is null then
    raise exception 'La revisión todavía no tiene archivo' using errcode = '22023';
  end if;

  select * into v_prev from public.revisions
  where document_id = v_rev.document_id and status = 'published' for update;
  if found then
    update public.revisions set status = 'superseded', superseded_at = now() where id = v_prev.id;
  end if;

  update public.revisions
  set status = 'published', published_at = now(), published_by = (select auth.uid())
  where id = p_id;

  select name into v_project_name from public.projects where id = v_rev.project_id;

  if v_prev.id is not null then
    for v_dep in
      update public.dependencies
      set status = 'to_review', status_changed_at = now(), status_changed_by = (select auth.uid())
      where source_revision_id = v_prev.id and status in ('current', 'revalidated')
      returning *
    loop
      v_affected := v_affected + 1;
      v_event := private.log_event(v_rev.org_id, 'dependency.to_review', 'dependency', v_dep.id,
        jsonb_build_object('project_id', v_rev.project_id, 'title', v_dep.title, 'kind', v_dep.kind,
                           'document_code', v_doc.code, 'from_revision_code', v_prev.code,
                           'to_revision_code', v_rev.code));

      -- Al responsable; si la pieza no tiene, a los dueños del estudio.
      insert into public.outbox (org_id, event_id, kind, to_email, payload)
      select v_rev.org_id, v_event, 'dependency_to_review', e.email,
             jsonb_build_object('project_name', v_project_name, 'project_id', v_rev.project_id,
                                'title', v_dep.title, 'kind', v_dep.kind, 'document_code', v_doc.code,
                                'from_revision_code', v_prev.code, 'to_revision_code', v_rev.code)
      from (
        select v_dep.responsible_email as email where v_dep.responsible_email is not null
        union
        select lower(u.email) from public.memberships m join auth.users u on u.id = m.user_id
        where v_dep.responsible_email is null and m.org_id = v_rev.org_id and m.role = 'owner'
      ) e;
    end loop;
  end if;

  perform private.log_event(v_rev.org_id, 'revision.published', 'revision', p_id,
    jsonb_build_object('project_id', v_rev.project_id, 'document_id', v_doc.id, 'document_code', v_doc.code,
                       'code', v_rev.code, 'superseded_id', v_prev.id, 'superseded_code', v_prev.code,
                       'sha256', v_rev.sha256, 'dependencies_to_review', v_affected));
end;
$$;

revoke execute on function public.create_dependency(uuid, text, text, text, integer) from public, anon;
revoke execute on function public.attach_dependency_file(uuid, text, bigint, text) from public, anon;
revoke execute on function public.complete_dependency_upload(uuid, text) from public, anon;
revoke execute on function public.review_dependency(uuid, text) from public, anon;
grant execute on function public.create_dependency(uuid, text, text, text, integer) to authenticated;
grant execute on function public.attach_dependency_file(uuid, text, bigint, text) to authenticated;
grant execute on function public.complete_dependency_upload(uuid, text) to authenticated;
grant execute on function public.review_dependency(uuid, text) to authenticated;

revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;
