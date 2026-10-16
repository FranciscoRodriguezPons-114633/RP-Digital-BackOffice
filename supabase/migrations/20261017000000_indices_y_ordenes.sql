-- Sprint 2 · E3 Índices y E4 Órdenes de cambio (parte interna)
-- Valores mensuales de índices; etapas ajustadas por índice; órdenes de cambio numeradas
-- por proyecto, con huella del contenido para que el envío por link (sprint 3) sepa si cambió.

-- ---------------------------------------------------------------------------
-- Índices
-- ---------------------------------------------------------------------------
create table public.price_indices (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete cascade,
  name        text not null check (length(btrim(name)) between 2 and 60),
  period      date not null check (extract(day from period) = 1),  -- primer día del mes
  value       numeric(14, 4) not null check (value > 0),
  created_by  uuid not null references auth.users (id),
  created_at  timestamptz not null default now(),
  unique (org_id, name, period)
);
create index price_indices_org_name_period_idx on public.price_indices (org_id, name, period desc);

create trigger price_indices_audit after insert or update or delete on public.price_indices
for each row execute function private.audit_row('price_index');

-- Etapa vinculada a un índice: el honorario se actualiza por (valor actual ÷ valor del mes base).
alter table public.fee_stages
  add column index_name        text check (length(btrim(index_name)) between 2 and 60),
  add column index_base_period date check (extract(day from index_base_period) = 1),
  add constraint fee_stages_index_pair check ((index_name is null) = (index_base_period is null));

grant update (index_name, index_base_period) on public.fee_stages to authenticated;

-- ---------------------------------------------------------------------------
-- Órdenes de cambio
-- ---------------------------------------------------------------------------
create table public.change_orders (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations (id) on delete cascade,
  project_id          uuid not null references public.projects (id) on delete cascade,
  stage_id            uuid not null references public.fee_stages (id) on delete restrict,
  number              integer not null check (number > 0),
  title               text not null check (length(btrim(title)) between 3 and 160),
  description         text check (length(description) <= 4000),
  hours               numeric(8, 2) check (hours >= 0),
  amount              numeric(14, 2) not null check (amount >= 0),
  currency            text not null check (currency in ('ARS', 'USD')),
  affected_documents  text[] not null default '{}',
  status              text not null default 'draft'
                      check (status in ('draft', 'sent', 'approved', 'rejected', 'billable', 'void')),
  content_hash        text not null,
  created_by          uuid not null references auth.users (id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  sent_at             timestamptz,
  decided_at          timestamptz,
  voided_at           timestamptz,
  void_reason         text check (length(void_reason) <= 500),
  unique (project_id, number)
);
create index change_orders_org_id_idx on public.change_orders (org_id);
create index change_orders_stage_id_idx on public.change_orders (stage_id);
create index change_orders_project_status_idx on public.change_orders (project_id, status);

-- Huella del contenido: cambia si cambia cualquier cosa que el cliente aprueba.
create or replace function private.change_order_hash(p public.change_orders)
returns text
language sql immutable
set search_path = ''
as $$
  select encode(extensions.digest(jsonb_build_object(
    'stage_id', p.stage_id, 'title', p.title, 'description', coalesce(p.description, ''),
    'hours', p.hours, 'amount', p.amount, 'currency', p.currency,
    'affected_documents', to_jsonb(p.affected_documents))::text, 'sha256'), 'hex');
$$;

create or replace function private.change_order_before_write()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  -- Proyecto, organización y moneda salen de la etapa, solo al crear o al cambiar de etapa:
  -- un cambio de estado (anular, aprobar) nunca toca la moneda ni la huella.
  if tg_op = 'INSERT' or new.stage_id is distinct from old.stage_id then
    select s.org_id, s.project_id, s.currency into new.org_id, new.project_id, new.currency
    from public.fee_stages s where s.id = new.stage_id;
    if new.org_id is null then
      raise exception 'Etapa inexistente' using errcode = '23503';
    end if;
  end if;
  new.content_hash := private.change_order_hash(new);
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create trigger change_orders_before_write before insert or update on public.change_orders
for each row execute function private.change_order_before_write();

-- Las órdenes guardan la moneda de su etapa: si la etapa cambiara de moneda, el total
-- mezclaría pesos y dólares. Con órdenes vigentes, la moneda de la etapa queda fija.
create or replace function private.fee_stage_currency_guard()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.change_orders co where co.stage_id = new.id and co.status <> 'void') then
    raise exception 'La etapa tiene órdenes de cambio: no se puede cambiar la moneda' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger fee_stages_currency_guard before update of currency on public.fee_stages
for each row when (old.currency is distinct from new.currency)
execute function private.fee_stage_currency_guard();

-- ---------------------------------------------------------------------------
-- Resumen por etapa: se rehace para sumar índice y adicionales aprobados
-- ---------------------------------------------------------------------------
drop view public.fee_stage_summary;

create view public.fee_stage_summary
with (security_invoker = true) as
with base as (
  select
    s.*,
    coalesce(h.hours, 0)::numeric(10, 2) as hours_used,
    (case s.kind
       when 'fixed'  then s.amount
       when 'hourly' then round(coalesce(h.hours, 0) * s.hourly_rate, 2)
       else s.amount + round(greatest(coalesce(h.hours, 0) - coalesce(s.budget_hours, 0), 0)
                             * s.hourly_rate, 2)
     end)::numeric(14, 2) as fee_amount,
    bi.value as index_base_value,
    ci.value as index_current_value,
    ci.period as index_current_period
  from public.fee_stages s
  left join (
    select stage_id, sum(hours) as hours from public.time_entries group by stage_id
  ) h on h.stage_id = s.id
  left join public.price_indices bi
    on bi.org_id = s.org_id and bi.name = s.index_name and bi.period = s.index_base_period
  left join lateral (
    select pi.value, pi.period from public.price_indices pi
    where pi.org_id = s.org_id and pi.name = s.index_name
    order by pi.period desc limit 1
  ) ci on true
)
select
  b.id, b.org_id, b.project_id, b.name, b.position, b.kind, b.currency,
  b.amount, b.hourly_rate, b.budget_hours, b.alert_80_at, b.alert_100_at, b.created_at,
  b.index_name, b.index_base_period, b.index_base_value, b.index_current_value, b.index_current_period,
  b.hours_used,
  b.fee_amount,
  case when b.budget_hours > 0 then round(100 * b.hours_used / b.budget_hours, 1) end as budget_pct,
  -- Monto actualizado = monto × índice actual ÷ índice base, redondeado a 2 decimales.
  -- Si la etapa tiene índice pero falta el valor del mes base, queda sin ajustar (index_missing).
  (case when b.index_base_value is not null and b.index_current_value is not null
        then round(b.fee_amount * b.index_current_value / b.index_base_value, 2)
        else b.fee_amount end)::numeric(14, 2) as fee_adjusted,
  (b.index_name is not null and b.index_base_value is null) as index_missing,
  coalesce(co.approved, 0)::numeric(14, 2) as extras_approved,
  coalesce(co.pending, 0)::numeric(14, 2) as extras_pending,
  ((case when b.index_base_value is not null and b.index_current_value is not null
         then round(b.fee_amount * b.index_current_value / b.index_base_value, 2)
         else b.fee_amount end) + coalesce(co.approved, 0))::numeric(14, 2) as total_amount
from base b
left join (
  select stage_id,
         sum(amount) filter (where status in ('approved', 'billable')) as approved,
         sum(amount) filter (where status in ('draft', 'sent')) as pending
  from public.change_orders group by stage_id
) co on co.stage_id = b.id;

-- ---------------------------------------------------------------------------
-- Seguridad por fila
-- ---------------------------------------------------------------------------
alter table public.price_indices enable row level security;
alter table public.change_orders enable row level security;

create policy price_indices_select on public.price_indices
for select to authenticated using ((select private.is_org_member(org_id)));
create policy price_indices_insert on public.price_indices
for insert to authenticated
with check ((select private.is_org_owner(org_id)) and created_by = (select auth.uid()));
create policy price_indices_update on public.price_indices
for update to authenticated
using ((select private.is_org_owner(org_id))) with check ((select private.is_org_owner(org_id)));
create policy price_indices_delete on public.price_indices
for delete to authenticated using ((select private.is_org_owner(org_id)));

-- Órdenes: las leen los miembros; toda escritura pasa por las funciones de abajo.
create policy change_orders_select on public.change_orders
for select to authenticated using ((select private.is_org_member(org_id)));

revoke all on public.price_indices, public.change_orders, public.fee_stage_summary from anon;
revoke update on public.price_indices from authenticated;
grant update (value) on public.price_indices to authenticated;
revoke insert, update, delete on public.change_orders from authenticated;
grant select on public.fee_stage_summary to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: órdenes de cambio
-- ---------------------------------------------------------------------------
create or replace function public.create_change_order(
  p_stage_id uuid, p_title text, p_description text, p_hours numeric, p_amount numeric,
  p_affected_documents text[] default '{}')
returns table (id uuid, number integer)
language plpgsql security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_stage public.fee_stages%rowtype;
  v_number integer;
  v_id uuid;
begin
  select * into v_stage from public.fee_stages where fee_stages.id = p_stage_id;
  if not found or not private.is_org_member(v_stage.org_id) then
    raise exception 'No tenés acceso a esta etapa' using errcode = '42501';
  end if;

  -- Numeración correlativa por proyecto, sin huecos por carreras entre dos personas.
  perform 1 from public.projects where projects.id = v_stage.project_id for update;
  select coalesce(max(co.number), 0) + 1 into v_number
  from public.change_orders co where co.project_id = v_stage.project_id;

  insert into public.change_orders (org_id, project_id, stage_id, number, title, description, hours,
                                    amount, currency, affected_documents, content_hash, created_by)
  values (v_stage.org_id, v_stage.project_id, p_stage_id, v_number, btrim(p_title),
          nullif(btrim(p_description), ''), p_hours, p_amount, v_stage.currency,
          coalesce(p_affected_documents, '{}'), '', (select auth.uid()))
  returning change_orders.id into v_id;

  perform private.log_event(v_stage.org_id, 'change_order.created', 'change_order', v_id,
    jsonb_build_object('project_id', v_stage.project_id, 'number', v_number,
                       'title', btrim(p_title), 'amount', p_amount, 'currency', v_stage.currency));
  return query select v_id, v_number;
end;
$$;

create or replace function public.update_change_order(
  p_id uuid, p_stage_id uuid, p_title text, p_description text, p_hours numeric, p_amount numeric,
  p_affected_documents text[] default '{}')
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_co public.change_orders%rowtype;
  v_new_stage public.fee_stages%rowtype;
  v_old_hash text;
  v_new_hash text;
begin
  select * into v_co from public.change_orders where id = p_id for update;
  if not found or not private.is_org_member(v_co.org_id) then
    raise exception 'No tenés acceso a esta orden' using errcode = '42501';
  end if;
  if v_co.status not in ('draft', 'sent') then
    raise exception 'Una orden % no se puede editar', v_co.status using errcode = '22023';
  end if;
  select * into v_new_stage from public.fee_stages where id = p_stage_id;
  if not found or v_new_stage.project_id <> v_co.project_id then
    raise exception 'La etapa tiene que ser del mismo proyecto' using errcode = '22023';
  end if;

  v_old_hash := v_co.content_hash;
  update public.change_orders
  set stage_id = p_stage_id, title = btrim(p_title), description = nullif(btrim(p_description), ''),
      hours = p_hours, amount = p_amount, affected_documents = coalesce(p_affected_documents, '{}')
  where id = p_id
  returning content_hash into v_new_hash;

  if v_new_hash <> v_old_hash then
    perform private.log_event(v_co.org_id, 'change_order.updated', 'change_order', p_id,
      jsonb_build_object('project_id', v_co.project_id, 'number', v_co.number, 'title', btrim(p_title),
                         'previous_hash', v_old_hash, 'content_hash', v_new_hash));
  end if;
end;
$$;

create or replace function public.void_change_order(p_id uuid, p_reason text)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_co public.change_orders%rowtype;
begin
  select * into v_co from public.change_orders where id = p_id for update;
  if not found or not private.is_org_owner(v_co.org_id) then
    raise exception 'Solo el dueño del estudio puede anular órdenes' using errcode = '42501';
  end if;
  if v_co.status = 'void' then
    return;
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Indicá el motivo de la anulación' using errcode = '22023';
  end if;

  update public.change_orders
  set status = 'void', voided_at = now(), void_reason = btrim(p_reason)
  where id = p_id;

  perform private.log_event(v_co.org_id, 'change_order.voided', 'change_order', p_id,
    jsonb_build_object('project_id', v_co.project_id, 'number', v_co.number, 'title', v_co.title,
                       'previous_status', v_co.status, 'reason', btrim(p_reason)));
end;
$$;

revoke execute on function public.create_change_order(uuid, text, text, numeric, numeric, text[]) from public, anon;
revoke execute on function public.update_change_order(uuid, uuid, text, text, numeric, numeric, text[]) from public, anon;
revoke execute on function public.void_change_order(uuid, text) from public, anon;
grant execute on function public.create_change_order(uuid, text, text, numeric, numeric, text[]) to authenticated;
grant execute on function public.update_change_order(uuid, uuid, text, text, numeric, numeric, text[]) to authenticated;
grant execute on function public.void_change_order(uuid, text) to authenticated;

revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;
