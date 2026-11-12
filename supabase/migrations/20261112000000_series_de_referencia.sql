-- Finanzas de obra · Sprint 2: series de referencia, tipo de cambio
-- Los índices que publican otros (CAC, ICC Córdoba, UOCRA, FACPCE) se cargan una vez para
-- toda la plataforma. Cada estudio adopta los que usa: el historial se copia a `price_indices`
-- con un nombre local (así `fee_stage_summary` no cambia) y cada valor nuevo o rectificado se
-- propaga en la misma transacción a quienes la adoptaron.

-- ---------------------------------------------------------------------------
-- Series y valores (sin org_id: son de la plataforma)
-- ---------------------------------------------------------------------------
create table public.reference_series (
  code        text primary key check (code ~ '^[a-z0-9_]{2,40}$'),
  name        text not null unique check (length(btrim(name)) between 2 and 60),
  unit        text not null check (length(btrim(unit)) between 1 and 40),
  publisher   text not null check (length(btrim(publisher)) between 2 and 120),
  source_url  text check (source_url ~ '^https://'),
  note        text check (length(note) <= 500),
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);

create table public.reference_values (
  series_code  text not null references public.reference_series (code) on delete cascade,
  period       date not null check (extract(day from period) = 1),  -- primer día del mes
  value        numeric(14, 4) not null check (value > 0),
  provisional  boolean not null default false,
  note         text check (length(note) <= 500),
  loaded_by    uuid references auth.users (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (series_code, period)
);

-- Rectificaciones: el valor anterior queda acá (solo inserción). Los estudios que adoptaron
-- la serie además ven el cambio en su propio registro de eventos (price_index.updated).
create table public.reference_value_revisions (
  id                bigint generated always as identity primary key,
  series_code       text not null references public.reference_series (code) on delete cascade,
  period            date not null,
  old_value         numeric(14, 4) not null,
  new_value         numeric(14, 4) not null,
  old_provisional   boolean not null,
  new_provisional   boolean not null,
  note              text,
  actor_id          uuid,
  actor_email       text,
  created_at        timestamptz not null default now()
);
create index reference_value_revisions_series_idx on public.reference_value_revisions (series_code, period);

alter table public.reference_series enable row level security;
alter table public.reference_values enable row level security;
alter table public.reference_value_revisions enable row level security;

create policy reference_series_select on public.reference_series for select to authenticated using (true);
create policy reference_values_select on public.reference_values for select to authenticated using (true);
create policy reference_value_revisions_select on public.reference_value_revisions
for select to authenticated using ((select private.is_platform_admin()));

revoke all on public.reference_series, public.reference_values, public.reference_value_revisions from anon;
revoke insert, update, delete on public.reference_series, public.reference_values, public.reference_value_revisions
  from authenticated;

-- Series iniciales. Los valores los carga la plataforma desde /admin/series.
-- UOCRA: la zona que corresponde a Córdoba falta validarla; mientras tanto, Zona A provisoria.
insert into public.reference_series (code, name, unit, publisher, source_url, note, position) values
  ('cac_general', 'CAC general', 'índice', 'Cámara Argentina de la Construcción', 'https://www.cac.com.ar/', null, 10),
  ('cac_materiales', 'CAC materiales', 'índice', 'Cámara Argentina de la Construcción', 'https://www.cac.com.ar/', null, 20),
  ('cac_mano_obra', 'CAC mano de obra', 'índice', 'Cámara Argentina de la Construcción', 'https://www.cac.com.ar/', null, 30),
  ('icc_cordoba', 'ICC Córdoba', 'índice', 'Dirección General de Estadística y Censos de Córdoba',
   'https://estadistica.cba.gov.ar/', null, 40),
  ('uocra_ayudante', 'UOCRA ayudante', 'ARS por hora', 'UOCRA, escala salarial', 'https://www.uocra.org/',
   'Zona A, provisoria hasta validar la zona de Córdoba', 50),
  ('uocra_medio_oficial', 'UOCRA medio oficial', 'ARS por hora', 'UOCRA, escala salarial', 'https://www.uocra.org/',
   'Zona A, provisoria hasta validar la zona de Córdoba', 60),
  ('uocra_oficial', 'UOCRA oficial', 'ARS por hora', 'UOCRA, escala salarial', 'https://www.uocra.org/',
   'Zona A, provisoria hasta validar la zona de Córdoba', 70),
  ('uocra_oficial_especializado', 'UOCRA oficial especializado', 'ARS por hora', 'UOCRA, escala salarial',
   'https://www.uocra.org/', 'Zona A, provisoria hasta validar la zona de Córdoba', 80),
  ('facpce_rt6', 'FACPCE RT 6', 'índice', 'FACPCE, ajuste por inflación', 'https://www.facpce.org.ar/', null, 90);

-- ---------------------------------------------------------------------------
-- Adopción por organización
-- ---------------------------------------------------------------------------
create table public.org_reference_series (
  org_id       uuid not null references public.organizations (id) on delete cascade,
  series_code  text not null references public.reference_series (code) on delete restrict,
  local_name   text not null check (length(btrim(local_name)) between 2 and 60),
  adopted_by   uuid not null references auth.users (id),
  adopted_at   timestamptz not null default now(),
  primary key (org_id, series_code),
  unique (org_id, local_name)
);

alter table public.org_reference_series enable row level security;
create policy org_reference_series_select on public.org_reference_series
for select to authenticated using ((select private.is_org_member(org_id)));
revoke all on public.org_reference_series from anon;
revoke insert, update, delete on public.org_reference_series from authenticated;

-- Los valores adoptados se marcan: vienen de una serie y pueden ser provisorios.
alter table public.price_indices
  add column reference_series_code text references public.reference_series (code) on delete set null,
  add column provisional boolean not null default false;

-- Un índice adoptado no se edita a mano: solo lo escribe la propagación desde la serie.
create or replace function private.price_indices_adopted_guard()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_row public.price_indices := case when tg_op = 'DELETE' then old else new end;
begin
  if coalesce(current_setting('app.reference_sync', true), '') = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if exists (select 1 from public.org_reference_series o
             where o.org_id = v_row.org_id and o.local_name = v_row.name)
     or (tg_op = 'UPDATE' and exists (select 1 from public.org_reference_series o
             where o.org_id = old.org_id and o.local_name = old.name)) then
    raise exception 'Este índice se actualiza solo desde la serie de referencia' using errcode = '42501';
  end if;
  if tg_op <> 'DELETE' then
    new.reference_series_code := null;
    new.provisional := false;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger price_indices_adopted_guard before insert or update or delete on public.price_indices
for each row execute function private.price_indices_adopted_guard();

-- Propagación: cada valor nuevo o rectificado llega a los estudios que adoptaron la serie.
create or replace function private.propagate_reference_value()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  perform set_config('app.reference_sync', 'on', true);
  insert into public.price_indices (org_id, name, period, value, created_by, reference_series_code, provisional)
  select o.org_id, o.local_name, new.period, new.value, coalesce((select auth.uid()), o.adopted_by),
         new.series_code, new.provisional
  from public.org_reference_series o
  where o.series_code = new.series_code
  on conflict (org_id, name, period) do update
    set value = excluded.value, provisional = excluded.provisional,
        reference_series_code = excluded.reference_series_code
    where public.price_indices.value is distinct from excluded.value
       or public.price_indices.provisional is distinct from excluded.provisional;
  perform set_config('app.reference_sync', '', true);
  return null;
end;
$$;

create trigger reference_values_propagate after insert or update on public.reference_values
for each row execute function private.propagate_reference_value();

-- ---------------------------------------------------------------------------
-- RPC: carga de valores (plataforma)
-- ---------------------------------------------------------------------------
-- p_rows: [{"period": "2026-09-01", "value": 1234.5, "provisional": true, "note": "..."}]
-- Un valor igual al que ya estaba no hace nada; uno distinto es una rectificación.
create or replace function public.load_reference_values(p_series text, p_rows jsonb)
returns table (inserted integer, rectified integer, unchanged integer)
language plpgsql security definer
set search_path = ''
as $$
declare
  v_row jsonb;
  v_period date;
  v_value numeric;
  v_provisional boolean;
  v_note text;
  v_current public.reference_values%rowtype;
  v_inserted integer := 0;
  v_rectified integer := 0;
  v_unchanged integer := 0;
  v_line integer := 0;
begin
  if not private.is_platform_admin() then
    raise exception 'Solo la administración de la plataforma carga series de referencia' using errcode = '42501';
  end if;
  if not exists (select 1 from public.reference_series s where s.code = p_series) then
    raise exception 'La serie no existe' using errcode = '22023';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'No hay valores para cargar' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) > 600 then
    raise exception 'Hasta 600 valores por carga' using errcode = '22023';
  end if;

  for v_row in select * from jsonb_array_elements(p_rows) loop
    v_line := v_line + 1;
    begin
      v_period := (v_row ->> 'period')::date;
      v_value := (v_row ->> 'value')::numeric;
    exception when others then
      raise exception 'Fila %: mes o valor inválido', v_line using errcode = '22023';
    end;
    if v_period is null or extract(day from v_period) <> 1 or v_value is null or v_value <= 0 then
      raise exception 'Fila %: mes o valor inválido', v_line using errcode = '22023';
    end if;
    v_provisional := coalesce((v_row ->> 'provisional')::boolean, false);
    v_note := nullif(btrim(left(v_row ->> 'note', 500)), '');

    select * into v_current from public.reference_values rv
    where rv.series_code = p_series and rv.period = v_period for update;

    if not found then
      insert into public.reference_values (series_code, period, value, provisional, note, loaded_by)
      values (p_series, v_period, v_value, v_provisional, v_note, (select auth.uid()));
      v_inserted := v_inserted + 1;
    elsif v_current.value = v_value and v_current.provisional = v_provisional then
      v_unchanged := v_unchanged + 1;
    else
      insert into public.reference_value_revisions (series_code, period, old_value, new_value, old_provisional,
                                                    new_provisional, note, actor_id, actor_email)
      values (p_series, v_period, v_current.value, v_value, v_current.provisional, v_provisional, v_note,
              (select auth.uid()), private.current_email());
      update public.reference_values rv
      set value = v_value, provisional = v_provisional, note = coalesce(v_note, rv.note),
          loaded_by = (select auth.uid()), updated_at = now()
      where rv.series_code = p_series and rv.period = v_period;
      v_rectified := v_rectified + 1;
    end if;
  end loop;

  return query select v_inserted, v_rectified, v_unchanged;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: adoptar una serie (dueño)
-- ---------------------------------------------------------------------------
-- Si el estudio ya cargaba a mano un índice con ese nombre, p_replace = true lo reemplaza
-- por el historial de la serie; si no, se pide otro nombre.
create or replace function public.adopt_reference_series(
  p_org_id uuid, p_series text, p_local_name text, p_replace boolean default false)
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  v_name text := btrim(p_local_name);
  v_replaced integer := 0;
  v_copied integer := 0;
begin
  if not private.is_org_owner(p_org_id) then
    raise exception 'Solo el dueño adopta series de referencia' using errcode = '42501';
  end if;
  if not exists (select 1 from public.reference_series s where s.code = p_series) then
    raise exception 'La serie no existe' using errcode = '22023';
  end if;
  if exists (select 1 from public.org_reference_series o where o.org_id = p_org_id and o.series_code = p_series) then
    raise exception 'Ya adoptaste esta serie' using errcode = '23505';
  end if;
  if v_name is null or length(v_name) not between 2 and 60 then
    raise exception 'El nombre necesita entre 2 y 60 caracteres' using errcode = '23514';
  end if;
  if exists (select 1 from public.org_reference_series o where o.org_id = p_org_id and o.local_name = v_name) then
    raise exception 'Ese nombre ya lo usa otra serie adoptada' using errcode = '23505';
  end if;
  if exists (select 1 from public.price_indices pi where pi.org_id = p_org_id and pi.name = v_name) then
    if not coalesce(p_replace, false) then
      raise exception 'Ya tenés un índice cargado a mano con ese nombre' using errcode = '23505';
    end if;
    delete from public.price_indices pi where pi.org_id = p_org_id and pi.name = v_name;
    get diagnostics v_replaced = row_count;
  end if;

  insert into public.org_reference_series (org_id, series_code, local_name, adopted_by)
  values (p_org_id, p_series, v_name, (select auth.uid()));

  perform set_config('app.reference_sync', 'on', true);
  insert into public.price_indices (org_id, name, period, value, created_by, reference_series_code, provisional)
  select p_org_id, v_name, rv.period, rv.value, (select auth.uid()), p_series, rv.provisional
  from public.reference_values rv where rv.series_code = p_series;
  get diagnostics v_copied = row_count;
  perform set_config('app.reference_sync', '', true);

  perform private.log_event(p_org_id, 'reference_series.adopted', 'reference_series', null,
    jsonb_build_object('series_code', p_series, 'local_name', v_name, 'values', v_copied, 'replaced', v_replaced));
  return v_copied;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tipo de cambio
-- ---------------------------------------------------------------------------
create table public.exchange_rates (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete cascade,
  currency    text not null default 'USD' check (currency in ('USD')),
  rate_date   date not null,
  source      text not null check (source in ('official', 'mep', 'ccl', 'blue', 'other')),
  rate        numeric(14, 4) not null check (rate > 0),  -- pesos por unidad de la moneda
  created_by  uuid not null references auth.users (id),
  created_at  timestamptz not null default now(),
  unique (org_id, currency, rate_date, source)
);
create index exchange_rates_lookup_idx on public.exchange_rates (org_id, currency, source, rate_date desc);

create trigger exchange_rates_audit after insert or update or delete on public.exchange_rates
for each row execute function private.audit_row('exchange_rate');

alter table public.exchange_rates enable row level security;
create policy exchange_rates_select on public.exchange_rates
for select to authenticated using ((select private.is_org_member(org_id)));
create policy exchange_rates_insert on public.exchange_rates
for insert to authenticated
with check ((select private.is_org_owner(org_id)) and created_by = (select auth.uid()));
create policy exchange_rates_update on public.exchange_rates
for update to authenticated
using ((select private.is_org_owner(org_id))) with check ((select private.is_org_owner(org_id)));
create policy exchange_rates_delete on public.exchange_rates
for delete to authenticated using ((select private.is_org_owner(org_id)));

revoke all on public.exchange_rates from anon;
revoke update on public.exchange_rates from authenticated;
grant update (rate) on public.exchange_rates to authenticated;

-- El último valor anterior o igual a la fecha (null si no hay ninguno). Respeta la RLS.
create or replace function public.exchange_rate_at(
  p_org_id uuid, p_currency text, p_date date, p_source text default 'official')
returns numeric
language sql stable
set search_path = ''
as $$
  select er.rate from public.exchange_rates er
  where er.org_id = p_org_id and er.currency = p_currency and er.source = p_source and er.rate_date <= p_date
  order by er.rate_date desc limit 1;
$$;

-- Para mostrar el panel de la plataforma solo a quien lo administra.
create or replace function public.am_platform_admin()
returns boolean
language sql stable
set search_path = ''
as $$
  select private.is_platform_admin();
$$;

revoke execute on function public.load_reference_values(text, jsonb) from public, anon;
revoke execute on function public.adopt_reference_series(uuid, text, text, boolean) from public, anon;
revoke execute on function public.exchange_rate_at(uuid, text, date, text) from public, anon;
revoke execute on function public.am_platform_admin() from public, anon;
grant execute on function public.load_reference_values(text, jsonb) to authenticated;
grant execute on function public.adopt_reference_series(uuid, text, text, boolean) to authenticated;
grant execute on function public.exchange_rate_at(uuid, text, date, text) to authenticated;
grant execute on function public.am_platform_admin() to authenticated;

revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;
