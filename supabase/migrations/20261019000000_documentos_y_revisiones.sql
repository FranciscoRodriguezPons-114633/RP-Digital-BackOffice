-- Sprint 3 · Inicio de E6: documentos y revisiones
-- Cada documento del proyecto (A-301, E-201…) tiene revisiones (C01, C02…) con su archivo.
-- Una sola revisión publicada por documento; publicar otra reemplaza la anterior.
-- Los archivos van a Storage, nunca se sobrescriben, y cada revisión guarda su SHA-256.
-- Las piezas dependientes y la bandeja "a revisar" llegan en el sprint 4.

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------
create table public.documents (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete cascade,
  project_id  uuid not null references public.projects (id) on delete cascade,
  code        text not null check (length(btrim(code)) between 1 and 40),
  title       text not null check (length(btrim(title)) between 2 and 160),
  discipline  text not null default 'architecture'
              check (discipline in ('architecture', 'structure', 'mep', 'other')),
  created_by  uuid not null references auth.users (id),
  created_at  timestamptz not null default now(),
  unique (project_id, code)
);
create index documents_org_id_idx on public.documents (org_id);

create table public.revisions (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id) on delete cascade,
  project_id    uuid not null references public.projects (id) on delete cascade,
  document_id   uuid not null references public.documents (id) on delete restrict,
  code          text not null check (length(btrim(code)) between 1 and 20),
  status        text not null default 'draft' check (status in ('draft', 'shared', 'published', 'superseded')),
  notes         text check (length(notes) <= 1000),
  file_name     text not null check (length(file_name) between 1 and 200),
  file_size     bigint not null check (file_size > 0 and file_size <= 52428800),
  mime_type     text not null check (mime_type in ('application/pdf', 'image/png', 'image/jpeg', 'image/webp')),
  storage_path  text not null unique,
  sha256        text check (sha256 ~ '^[0-9a-f]{64}$'),
  uploaded_at   timestamptz,  -- el archivo llegó a Storage y se calculó su huella
  created_by    uuid not null references auth.users (id),
  created_at    timestamptz not null default now(),
  published_at  timestamptz,
  published_by  uuid references auth.users (id),
  superseded_at timestamptz,
  unique (document_id, code),
  constraint revisions_published_has_file check (status = 'draft' or uploaded_at is not null)
);
create index revisions_org_id_idx on public.revisions (org_id);
create index revisions_project_id_idx on public.revisions (project_id);
-- La regla que no puede fallar: nunca dos revisiones publicadas del mismo documento.
create unique index revisions_one_published on public.revisions (document_id) where status = 'published';

-- ---------------------------------------------------------------------------
-- Bucket privado y permisos sobre los archivos
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 52428800,
        array['application/pdf', 'image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

-- Se puede subir solo al lugar exacto de una revisión creada y todavía sin archivo.
create or replace function private.can_upload_revision_file(p_name text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.revisions r
    where r.storage_path = p_name and r.uploaded_at is null and private.is_org_member(r.org_id)
  );
$$;

create or replace function private.can_read_revision_file(p_name text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.revisions r
    where r.storage_path = p_name and private.is_org_member(r.org_id)
  );
$$;

-- Sin políticas de UPDATE ni DELETE: un archivo subido no se reemplaza ni se borra desde la app.
create policy documents_insert_revision_file on storage.objects
for insert to authenticated
with check (bucket_id = 'documents' and private.can_upload_revision_file(name));
create policy documents_read_revision_file on storage.objects
for select to authenticated
using (bucket_id = 'documents' and private.can_read_revision_file(name));

-- ---------------------------------------------------------------------------
-- Seguridad por fila (escrituras solo por funciones)
-- ---------------------------------------------------------------------------
alter table public.documents enable row level security;
alter table public.revisions enable row level security;

create policy documents_select on public.documents
for select to authenticated using ((select private.is_org_member(org_id)));
create policy revisions_select on public.revisions
for select to authenticated using ((select private.is_org_member(org_id)));

revoke all on public.documents, public.revisions from anon;
revoke insert, update, delete on public.documents, public.revisions from authenticated;

-- ---------------------------------------------------------------------------
-- RPC
-- ---------------------------------------------------------------------------
create or replace function public.create_document(
  p_project_id uuid, p_code text, p_title text, p_discipline text default 'architecture')
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_project public.projects%rowtype;
  v_id uuid;
begin
  select * into v_project from public.projects where id = p_project_id;
  if not found or not private.is_org_member(v_project.org_id) then
    raise exception 'No tenés acceso a este proyecto' using errcode = '42501';
  end if;

  insert into public.documents (org_id, project_id, code, title, discipline, created_by)
  values (v_project.org_id, p_project_id, upper(btrim(p_code)), btrim(p_title),
          coalesce(p_discipline, 'architecture'), (select auth.uid()))
  returning id into v_id;

  perform private.log_event(v_project.org_id, 'document.created', 'document', v_id,
    jsonb_build_object('project_id', p_project_id, 'code', upper(btrim(p_code)), 'title', btrim(p_title)));
  return v_id;
end;
$$;

-- Crea la revisión en borrador y devuelve dónde subir el archivo:
-- {org}/{proyecto}/{documento}/{revisión}/{archivo}.
create or replace function public.create_revision(
  p_document_id uuid, p_code text, p_file_name text, p_file_size bigint, p_mime_type text,
  p_notes text default null)
returns table (id uuid, storage_path text)
language plpgsql security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_doc public.documents%rowtype;
  v_id uuid := gen_random_uuid();
  v_safe_name text;
  v_path text;
begin
  select * into v_doc from public.documents d where d.id = p_document_id;
  if not found or not private.is_org_member(v_doc.org_id) then
    raise exception 'No tenés acceso a este documento' using errcode = '42501';
  end if;

  v_safe_name := left(regexp_replace(btrim(coalesce(p_file_name, '')), '[^A-Za-z0-9._-]+', '-', 'g'), 120);
  if v_safe_name = '' or v_safe_name ~ '^[.-]*$' then
    v_safe_name := 'archivo';
  end if;
  v_path := v_doc.org_id || '/' || v_doc.project_id || '/' || v_doc.id || '/' || v_id || '/' || v_safe_name;

  insert into public.revisions (id, org_id, project_id, document_id, code, notes, file_name, file_size,
                                mime_type, storage_path, created_by)
  values (v_id, v_doc.org_id, v_doc.project_id, v_doc.id, upper(btrim(p_code)), nullif(btrim(p_notes), ''),
          left(btrim(p_file_name), 200), p_file_size, p_mime_type, v_path, (select auth.uid()));

  return query select v_id, v_path;
end;
$$;

-- La app calcula la huella después de leer el archivo de Storage. La función confirma que
-- el archivo existe y toma su tamaño real.
create or replace function public.complete_revision_upload(p_id uuid, p_sha256 text)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_rev public.revisions%rowtype;
  v_size bigint;
begin
  select * into v_rev from public.revisions where id = p_id for update;
  if not found or not private.is_org_member(v_rev.org_id) then
    raise exception 'No tenés acceso a esta revisión' using errcode = '42501';
  end if;
  if v_rev.uploaded_at is not null then
    return;
  end if;
  if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Huella inválida' using errcode = '23514';
  end if;

  select (o.metadata ->> 'size')::bigint into v_size
  from storage.objects o where o.bucket_id = 'documents' and o.name = v_rev.storage_path;
  if not found then
    raise exception 'El archivo no llegó a subirse' using errcode = '22023';
  end if;

  update public.revisions
  set sha256 = p_sha256, uploaded_at = now(), file_size = coalesce(v_size, file_size)
  where id = p_id;

  perform private.log_event(v_rev.org_id, 'revision.uploaded', 'revision', p_id,
    jsonb_build_object('project_id', v_rev.project_id, 'document_id', v_rev.document_id,
                       'code', v_rev.code, 'file_name', v_rev.file_name, 'sha256', p_sha256));
end;
$$;

-- Una revisión que nunca recibió su archivo (subida cortada) se puede descartar.
create or replace function public.discard_revision(p_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_rev public.revisions%rowtype;
begin
  select * into v_rev from public.revisions where id = p_id for update;
  if not found or not private.is_org_member(v_rev.org_id) then
    raise exception 'No tenés acceso a esta revisión' using errcode = '42501';
  end if;
  if v_rev.uploaded_at is not null then
    raise exception 'Una revisión con archivo no se borra' using errcode = '22023';
  end if;
  delete from public.revisions where id = p_id;
end;
$$;

-- Publica una revisión: la publicada anterior del mismo documento pasa a reemplazada.
-- El bloqueo sobre el documento ordena dos publicaciones simultáneas; el índice único
-- garantiza que nunca queden dos publicadas.
create or replace function public.publish_revision(p_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_rev public.revisions%rowtype;
  v_doc public.documents%rowtype;
  v_prev public.revisions%rowtype;
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

  perform private.log_event(v_rev.org_id, 'revision.published', 'revision', p_id,
    jsonb_build_object('project_id', v_rev.project_id, 'document_id', v_doc.id, 'document_code', v_doc.code,
                       'code', v_rev.code, 'superseded_id', v_prev.id, 'superseded_code', v_prev.code,
                       'sha256', v_rev.sha256));
end;
$$;

revoke execute on function public.create_document(uuid, text, text, text) from public, anon;
revoke execute on function public.create_revision(uuid, text, text, bigint, text, text) from public, anon;
revoke execute on function public.complete_revision_upload(uuid, text) from public, anon;
revoke execute on function public.discard_revision(uuid) from public, anon;
revoke execute on function public.publish_revision(uuid) from public, anon;
grant execute on function public.create_document(uuid, text, text, text) to authenticated;
grant execute on function public.create_revision(uuid, text, text, bigint, text, text) to authenticated;
grant execute on function public.complete_revision_upload(uuid, text) to authenticated;
grant execute on function public.discard_revision(uuid) to authenticated;
grant execute on function public.publish_revision(uuid) to authenticated;

revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;
