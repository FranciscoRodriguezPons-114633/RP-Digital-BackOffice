-- Sprint 4 · E7: registro de envíos
-- El estudio envía revisiones o piezas a un invitado del proyecto. Cada envío guarda qué
-- archivo exacto se mandó (su SHA-256), a quién y cuándo, y cuándo lo abrió el invitado:
-- así se responde "qué vio este cliente y cuándo" en una pantalla.

create table public.shipments (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations (id) on delete cascade,
  project_id       uuid not null references public.projects (id) on delete cascade,
  recipient_email  text not null check (recipient_email = lower(btrim(recipient_email)) and position('@' in recipient_email) > 1),
  channel          text not null default 'email' check (channel in ('email', 'whatsapp', 'other')),
  note             text check (length(note) <= 500),
  created_by       uuid not null references auth.users (id),
  created_at       timestamptz not null default now()
);
create index shipments_org_id_idx on public.shipments (org_id);
create index shipments_project_recipient_idx on public.shipments (project_id, recipient_email);

create table public.shipment_items (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations (id) on delete cascade,
  shipment_id      uuid not null references public.shipments (id) on delete cascade,
  revision_id      uuid references public.revisions (id) on delete restrict,
  dependency_id    uuid references public.dependencies (id) on delete restrict,
  label            text not null,          -- "A-101 C03 · Planta baja", tal como se envió
  file_name        text not null,
  sha256           text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  first_opened_at  timestamptz,
  last_opened_at   timestamptz,
  open_count       integer not null default 0,
  constraint shipment_items_one_target check (num_nonnulls(revision_id, dependency_id) = 1)
);
create index shipment_items_org_id_idx on public.shipment_items (org_id);
create index shipment_items_shipment_idx on public.shipment_items (shipment_id);
create index shipment_items_revision_idx on public.shipment_items (revision_id);
create index shipment_items_dependency_idx on public.shipment_items (dependency_id);

-- ---------------------------------------------------------------------------
-- Acceso del invitado a lo que le enviaron
-- ---------------------------------------------------------------------------
create or replace function private.was_shipped_to_me(p_revision_id uuid, p_dependency_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.shipment_items i
    join public.shipments s on s.id = i.shipment_id
    where s.recipient_email = private.current_email()
      and (i.revision_id = p_revision_id or i.dependency_id = p_dependency_id)
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
        where d.storage_path = p_name
          and (private.can_access_dependency(d.id) or private.was_shipped_to_me(null, d.id))
      )
      or exists (
        select 1 from public.revisions r
        where r.storage_path = p_name and private.was_shipped_to_me(r.id, null)
      );
$$;

create policy revisions_select_shipped on public.revisions
for select to authenticated using (private.was_shipped_to_me(id, null));
create policy dependencies_select_shipped on public.dependencies
for select to authenticated using (private.was_shipped_to_me(null, id));

alter table public.shipments enable row level security;
alter table public.shipment_items enable row level security;

create policy shipments_select on public.shipments
for select to authenticated
using ((select private.is_org_member(org_id)) or recipient_email = (select private.current_email()));
create policy shipment_items_select on public.shipment_items
for select to authenticated
using (
  (select private.is_org_member(org_id))
  or exists (select 1 from public.shipments s
             where s.id = shipment_id and s.recipient_email = (select private.current_email()))
);

revoke all on public.shipments, public.shipment_items from anon;
revoke insert, update, delete on public.shipments, public.shipment_items from authenticated;

-- ---------------------------------------------------------------------------
-- RPC
-- ---------------------------------------------------------------------------
-- Envía revisiones y piezas a un invitado del proyecto. Una revisión en borrador pasa a
-- "compartida". Deja un evento y un correo al invitado.
create or replace function public.send_shipment(
  p_project_id uuid, p_recipient_email text, p_revision_ids uuid[] default '{}',
  p_dependency_ids uuid[] default '{}', p_channel text default 'email', p_note text default null)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_project public.projects%rowtype;
  v_email text := lower(btrim(coalesce(p_recipient_email, '')));
  v_id uuid;
  v_count integer;
  v_wanted integer := (select count(distinct x) from unnest(coalesce(p_revision_ids, '{}')) x)
                    + (select count(distinct x) from unnest(coalesce(p_dependency_ids, '{}')) x);
  v_org_name text;
  v_event bigint;
begin
  select * into v_project from public.projects where id = p_project_id;
  if not found or not private.is_org_member(v_project.org_id) then
    raise exception 'No tenés acceso a este proyecto' using errcode = '42501';
  end if;
  if not exists (select 1 from public.project_guests g where g.project_id = p_project_id and g.email = v_email) then
    raise exception 'Primero invitá a esa persona al proyecto' using errcode = '23514';
  end if;
  if v_wanted = 0 then
    raise exception 'Elegí al menos un archivo' using errcode = '23514';
  end if;

  insert into public.shipments (org_id, project_id, recipient_email, channel, note, created_by)
  values (v_project.org_id, p_project_id, v_email, coalesce(p_channel, 'email'), nullif(btrim(p_note), ''),
          (select auth.uid()))
  returning id into v_id;

  -- Solo archivos ya subidos, de este proyecto. Se guarda la huella de lo que se mandó.
  insert into public.shipment_items (org_id, shipment_id, revision_id, label, file_name, sha256)
  select v_project.org_id, v_id, r.id, d.code || ' ' || r.code || ' · ' || d.title, r.file_name, r.sha256
  from public.revisions r join public.documents d on d.id = r.document_id
  where r.id = any (coalesce(p_revision_ids, '{}')) and r.project_id = p_project_id and r.uploaded_at is not null;

  insert into public.shipment_items (org_id, shipment_id, dependency_id, label, file_name, sha256)
  select v_project.org_id, v_id, x.id, x.title, x.file_name, x.sha256
  from public.dependencies x
  where x.id = any (coalesce(p_dependency_ids, '{}')) and x.project_id = p_project_id and x.uploaded_at is not null;

  select count(*) into v_count from public.shipment_items where shipment_id = v_id;
  if v_count <> v_wanted then
    raise exception 'Algún archivo no es de este proyecto o todavía no se subió' using errcode = '22023';
  end if;

  update public.revisions set status = 'shared'
  where id = any (coalesce(p_revision_ids, '{}')) and status = 'draft';

  select name into v_org_name from public.organizations where id = v_project.org_id;
  v_event := private.log_event(v_project.org_id, 'shipment.sent', 'shipment', v_id,
    jsonb_build_object('project_id', p_project_id, 'recipient_email', v_email, 'channel', coalesce(p_channel, 'email'),
                       'items', (select jsonb_agg(jsonb_build_object('label', label, 'sha256', sha256))
                                 from public.shipment_items where shipment_id = v_id)));

  if coalesce(p_channel, 'email') = 'email' then
    insert into public.outbox (org_id, event_id, kind, to_email, payload)
    values (v_project.org_id, v_event, 'shipment_sent', v_email,
            jsonb_build_object('org_name', v_org_name, 'project_name', v_project.name, 'project_id', p_project_id,
                               'note', nullif(btrim(p_note), ''),
                               'labels', (select jsonb_agg(label order by label) from public.shipment_items
                                          where shipment_id = v_id)));
  end if;
  return v_id;
end;
$$;

-- La descarga de un archivo enviado anota cuándo lo abrió el destinatario.
create or replace function public.record_file_open(p_file_id uuid)
returns void
language sql security definer
set search_path = ''
as $$
  update public.shipment_items i
  set first_opened_at = coalesce(i.first_opened_at, now()), last_opened_at = now(), open_count = i.open_count + 1
  from public.shipments s
  where s.id = i.shipment_id and s.recipient_email = private.current_email()
    and (i.revision_id = p_file_id or i.dependency_id = p_file_id);
$$;

revoke execute on function public.send_shipment(uuid, text, uuid[], uuid[], text, text) from public, anon;
revoke execute on function public.record_file_open(uuid) from public, anon;
grant execute on function public.send_shipment(uuid, text, uuid[], uuid[], text, text) to authenticated;
grant execute on function public.record_file_open(uuid) to authenticated;

revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;
